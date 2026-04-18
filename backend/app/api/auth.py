import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.app.core.config import settings
from backend.app.db.base import get_session
from backend.app.models.orm import Athlete, PasswordResetToken, User
from backend.app.schemas.auth import (
    AdminResetTokenRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from backend.app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "refresh_token"
_COOKIE_PATH = "/api/auth"
_COOKIE_MAX_AGE = settings.refresh_token_expire_days * 24 * 60 * 60


def _set_refresh_cookie(response: Response, token: str) -> None:
    secure = settings.frontend_url.startswith("https://")
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path=_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path=_COOKIE_PATH)


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("10/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    existing = await session.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.flush()

    athlete = Athlete(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=body.display_name or None,
        ftp_tests=[],
    )
    session.add(athlete)
    await session.commit()

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("60/minute")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    session: AsyncSession = Depends(get_session),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id: str | None = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await session.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _set_refresh_cookie(response, create_refresh_token(user_id))
    return TokenResponse(access_token=create_access_token(user_id))


@router.post("/logout", status_code=204)
async def logout(response: Response):
    _clear_refresh_cookie(response)


@router.delete("/account", status_code=204)
async def delete_account(
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    _clear_refresh_cookie(response)


@router.post("/admin/reset-token")
@limiter.limit("5/hour")
async def admin_generate_reset_token(
    request: Request,
    body: AdminResetTokenRequest,
    x_admin_secret: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
):
    if not settings.admin_secret or not x_admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not secrets.compare_digest(x_admin_secret, settings.admin_secret):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await session.execute(
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Invalidate any existing unused tokens for this user
    existing = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for token_row in existing.scalars():
        token_row.used_at = datetime.now(timezone.utc)

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    ))
    await session.commit()

    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    return {"reset_url": reset_url, "expires_at": expires_at.isoformat()}


@router.post("/reset-password", status_code=204)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if token_row is None or token_row.used_at is not None or token_row.expires_at <= now:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user_result = await session.execute(
        select(User).where(User.id == token_row.user_id, User.deleted_at.is_(None))
    )
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user.password_hash = hash_password(body.new_password)
    token_row.used_at = now
    await session.commit()
