from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.agent import voice
from app.config import settings

log = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


@router.websocket("/ws/voice")
async def voice_ws(ws: WebSocket) -> None:
    """Real-time voice bridge to Gemini Live. The first client message must be
    {"token": ..., "org_id": ...} for auth (WebSockets can't carry our headers)."""
    await ws.accept()
    try:
        first = await ws.receive_json()
    except Exception:  # noqa: BLE001
        await ws.close(code=1008)
        return

    if not settings.ai_enabled:
        await ws.send_json({"type": "error", "message": "The voice assistant isn't configured."})
        await ws.close(code=1011)
        return

    auth = voice.authenticate(first.get("token", ""), first.get("org_id", ""))
    if auth is None:
        await ws.send_json({"type": "error", "message": "Unauthorized."})
        await ws.close(code=1008)
        return

    user_id, org_id = auth
    try:
        await voice.bridge(ws, user_id, org_id)
    except WebSocketDisconnect:
        pass
    except Exception as e:  # noqa: BLE001
        log.warning("Voice session error: %s", e)
        try:
            await ws.send_json({"type": "error", "message": "The voice session ended unexpectedly."})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
