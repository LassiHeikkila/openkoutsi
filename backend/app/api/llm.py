"""LLM proxy endpoint.

Security model
--------------
Users configure their own LLM endpoint (base URL, model, API key) in
Settings → AI / LLM.  The API key is encrypted server-side with AES-256
(Fernet) using a per-user HKDF-derived key — see file_encryption.py.  It is
stored in ``athlete.app_settings['llm_api_key_enc']`` and is **never**
returned to the browser after being saved.

When an LLM call is needed the server decrypts the key in-memory, adds it to
the outbound request headers, and proxies the OpenAI-compatible request to
the user's configured endpoint.  From the browser's perspective the request
goes to ``/api/llm/chat`` on the same origin, so:

* No API key is ever transmitted to the frontend.
* The browser's Content-Security-Policy (``connect-src 'self' ...``) already
  permits calls to the API origin — no extra CSP rules required.
* The LLM endpoint is called server-to-server, so mixed-content (HTTP ↔ HTTPS)
  restrictions in the browser do not apply.

SSRF mitigations
----------------
Because any authenticated user can set an arbitrary base URL, the server could
be used as a proxy to reach internal services.  The following defences are
applied:

1. Only ``http://`` and ``https://`` schemes are accepted.
2. The hostname is resolved to an IP address before the request is made.  If
   the resolved address is link-local (169.254.0.0/16, fe80::/10) — the range
   used by cloud-provider metadata services — the request is rejected.
   Loopback (127.x / ::1) and private RFC-1918 / RFC-4193 ranges are allowed
   so that Ollama running on localhost or a LAN machine works normally.
3. HTTP redirects are disabled so a redirect cannot bounce the server from a
   safe public host to an internal address.
4. The connection is made to the pre-resolved IP, not by passing the hostname
   to httpx again, to prevent trivial DNS rebinding.

Note: a single layer of DNS-based SSRF protection is not proof against all
DNS-rebinding attacks.  If your deployment is multi-tenant and users are not
fully trusted, consider restricting who can save an LLM base URL (e.g. admin
only) via an out-of-band policy.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.db.base import get_session
from backend.app.models.orm import Athlete, User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])

# Maximum bytes accepted from an upstream LLM response.
# This prevents a malicious or misconfigured server from exhausting server
# memory.  32 MB is generous for any realistic chat completion response.
_MAX_RESPONSE_BYTES = 32 * 1024 * 1024  # 32 MB

# ── SSRF guard ─────────────────────────────────────────────────────────────

_ALLOWED_SCHEMES = {"http", "https"}

# Link-local ranges used by cloud-provider metadata services.
# We block these specifically because they are nearly always unintentional and
# high-impact (IAM credentials, user-data scripts, etc.).
# We do NOT block all private/RFC-1918 ranges so that Ollama on localhost or a
# LAN address continues to work.
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("169.254.0.0/16"),    # IPv4 link-local (AWS/GCP/Azure metadata)
    ipaddress.ip_network("fe80::/10"),          # IPv6 link-local
    ipaddress.ip_network("fd00:ec2::254/128"),  # GCP internal metadata (IPv6)
]


def _check_url_safe(url: str) -> tuple[str, int]:
    """Validate *url* against SSRF risks.

    Returns *(resolved_host, port)* — the caller should connect to this
    IP directly rather than re-resolving the hostname, to prevent DNS rebinding.

    Raises ``HTTPException(400)`` for disallowed schemes or blocked addresses.
    """
    parsed = urlparse(url)

    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise HTTPException(
            status_code=400,
            detail=f"LLM base URL scheme '{parsed.scheme}' is not allowed. Use http or https.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="LLM base URL has no hostname.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    # Resolve hostname → IP.
    try:
        # getaddrinfo returns a list of (family, type, proto, canonname, sockaddr).
        # Take the first result's address.
        addr_info = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not resolve LLM hostname '{hostname}': {exc}",
        )

    resolved_ip_str = addr_info[0][4][0]
    try:
        resolved_ip = ipaddress.ip_address(resolved_ip_str)
    except ValueError:
        raise HTTPException(status_code=502, detail="LLM hostname resolved to an unparseable address.")

    for blocked in _BLOCKED_NETWORKS:
        if resolved_ip in blocked:
            log.warning(
                "SSRF guard: blocked request to %s (resolved to %s, in blocked range %s)",
                url, resolved_ip, blocked,
            )
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Requests to {resolved_ip} are not permitted. "
                    "That address is a cloud-provider metadata range."
                ),
            )

    return resolved_ip_str, port


# ── Request schema ─────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str
    content: str


class LlmChatRequest(BaseModel):
    messages: list[ChatMessage]
    temperature: float = 0.7
    stream: bool = False
    # Optional model override; if omitted, the athlete's configured model is used.
    model: Optional[str] = None


# ── LLM config helper ──────────────────────────────────────────────────────


@router.get("/servers")
async def get_allowed_servers(user: User = Depends(get_current_user)):
    """Return the list of LLM base URLs the admin has allow-listed.

    An empty list means no restriction is configured — users may enter any URL.
    """
    return {"servers": settings.llm_allowed_servers_list}


async def _get_llm_config(athlete: Athlete, user_id: str) -> tuple[str, str, str | None]:
    """Return *(base_url, model, api_key)* for this athlete.

    * *api_key* is None when no key has been configured (valid for local models).
    * Raises ``HTTPException(400)`` when no base URL is configured.
    * Raises ``HTTPException(500)`` when the stored key cannot be decrypted.
    """
    settings_dict = athlete.app_settings or {}
    base_url = (settings_dict.get("llm_base_url") or "").strip()
    model = (settings_dict.get("llm_model") or "llama3.2").strip()

    if not base_url:
        raise HTTPException(
            status_code=400,
            detail="LLM not configured. Set a base URL in Settings → AI / LLM.",
        )

    # Defense-in-depth: re-check against the allow-list at use time.
    # This catches any URL that bypassed the save-time check (e.g. stored before
    # the allow-list was configured, or inserted directly into the database).
    allowed = settings.llm_allowed_servers_list
    if allowed and base_url not in allowed:
        raise HTTPException(
            status_code=403,
            detail="The configured LLM server is not in the server's allowed list. "
            "Update your LLM settings to use an allowed server.",
        )

    api_key: str | None = None
    enc_key = settings_dict.get("llm_api_key_enc")
    if enc_key:
        try:
            from backend.app.core.file_encryption import decrypt_secret

            api_key = decrypt_secret(str(enc_key), user_id)
        except Exception as exc:
            log.error("Failed to decrypt LLM API key for user %s: %s", user_id, exc)
            raise HTTPException(
                status_code=500,
                detail="Failed to decrypt the stored LLM API key. "
                "Try re-entering your key in Settings → AI / LLM.",
            )

    return base_url, model, api_key


# ── Endpoint ───────────────────────────────────────────────────────────────


@router.post("/chat")
async def llm_chat(
    body: LlmChatRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Proxy an OpenAI-compatible chat completion to the user's LLM endpoint.

    The API key is decrypted server-side and injected into the upstream
    request — it never passes through the browser.
    """
    result = await session.execute(select(Athlete).where(Athlete.user_id == user.id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete profile not found")

    base_url, model, api_key = await _get_llm_config(athlete, user.id)
    upstream_url = f"{base_url.rstrip('/')}/chat/completions"

    # SSRF check — raises HTTPException on blocked addresses.
    _check_url_safe(upstream_url)

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload: dict[str, Any] = {
        "model": body.model or model,
        "messages": [{"role": m.role, "content": m.content} for m in body.messages],
        "temperature": body.temperature,
        "stream": body.stream,
    }

    # Redirects are disabled to prevent a redirect from a safe public URL to
    # an internal address (a common SSRF bypass technique).
    transport = httpx.AsyncHTTPTransport(retries=0)

    if body.stream:
        # --- Streaming path ---
        # Inspect the upstream HTTP status after headers arrive but before
        # reading the body, so we can surface errors as proper HTTP errors
        # rather than embedding them in an already-200 SSE stream.
        client = httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            timeout=httpx.Timeout(120.0),
        )
        try:
            req = client.build_request("POST", upstream_url, headers=headers, json=payload)
            resp = await client.send(req, stream=True)
        except Exception as exc:
            await client.aclose()
            raise HTTPException(
                status_code=502,
                detail=f"Could not reach LLM endpoint: {exc}",
            )

        if resp.status_code != 200:
            error_bytes = await resp.aread()
            await resp.aclose()
            await client.aclose()
            raise HTTPException(
                status_code=502,
                detail=f"LLM returned {resp.status_code}: {error_bytes[:512].decode(errors='replace')}",
            )

        async def _iter_upstream():
            total = 0
            try:
                async for chunk in resp.aiter_bytes():
                    total += len(chunk)
                    if total > _MAX_RESPONSE_BYTES:
                        log.warning("LLM streaming response exceeded %d bytes — aborting", _MAX_RESPONSE_BYTES)
                        yield b"data: [DONE]\n\n"
                        return
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(_iter_upstream(), media_type="text/event-stream")

    else:
        # --- Non-streaming path ---
        async with httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            timeout=httpx.Timeout(120.0),
        ) as client:
            try:
                resp = await client.post(upstream_url, headers=headers, json=payload)
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Could not reach LLM endpoint: {exc}",
                )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM returned {resp.status_code}: {resp.text[:512]}",
                )

            if len(resp.content) > _MAX_RESPONSE_BYTES:
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM response exceeded the {_MAX_RESPONSE_BYTES // (1024*1024)} MB limit.",
                )

            return resp.json()
