import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
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
from backend.app.models.orm import Athlete, User
from backend.app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
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
