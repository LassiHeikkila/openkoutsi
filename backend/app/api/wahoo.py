"""
Wahoo webhook endpoint.

Receives workout_summary events posted directly from Wahoo's API.
The webhook_token in the payload is matched against WAHOO_WEBHOOK_TOKEN
in the environment — no HMAC signing is used by Wahoo.
"""

import asyncio
import logging
import secrets

from fastapi import APIRouter, HTTPException, Request

from backend.app.core.config import settings
from backend.app.db.base import AsyncSessionLocal
from backend.app.services.wahoo_sync import process_wahoo_webhook

log = logging.getLogger(__name__)

router = APIRouter(prefix="/wahoo", tags=["wahoo"])


@router.post("/webhook")
async def wahoo_webhook(request: Request):
    if not settings.wahoo_webhook_token:
        raise HTTPException(status_code=403, detail="Wahoo webhooks not configured")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    token = str(payload.get("webhook_token", ""))
    if not secrets.compare_digest(token, settings.wahoo_webhook_token):
        raise HTTPException(status_code=403, detail="Invalid webhook token")

    if payload.get("event_type") != "workout_summary":
        return {"status": "ignored"}

    # Process asynchronously so we return 200 quickly — Wahoo retries on non-200.
    asyncio.create_task(_handle_event(payload))
    return {"status": "ok"}


async def _handle_event(payload: dict) -> None:
    async with AsyncSessionLocal() as session:
        try:
            await process_wahoo_webhook(payload, session)
        except Exception:
            log.exception("Failed to process Wahoo webhook event")
