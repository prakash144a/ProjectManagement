"""Voice agent: a Gemini **Live** (real-time streaming audio) bridge.

Architecture mirrors the text chat: the browser never talks to Gemini directly.
It streams mic audio to our backend over a WebSocket; we relay it to a Gemini
Live session, stream the spoken audio (+ transcripts) back, and — when the model
calls a tool — run it through the **same in-process tool layer** (`agent.tools`)
as the text chat. So the voice agent acts as the user, and authorization/audit/
`confirm=true` stay enforced in one place.

Audio formats (Gemini Live): input = raw PCM 16-bit, 16 kHz, mono; output = raw
PCM 16-bit, 24 kHz, mono.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from google import genai
from google.genai import types

from app.agent import tools as toolmod
from app.agent.tools import ToolContext
from app.config import settings
from app.db.engine import SessionLocal
from app.db.session import set_current_org, set_current_user
from app.models.identity import User
from app.services import auth_service, authz

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a friendly voice assistant inside a task-management app. You are having a
spoken conversation, so keep replies short, natural, and conversational — a
sentence or two. You act AS the current user and can manage their teams, projects,
and tasks using the provided tools.

- Resolve ids with the list_* tools before creating or updating anything; never invent ids.
- To mark a task done, set a status whose is_completed is true (see list_statuses).
- For destructive or bulk actions (like deleting a task), ask the user to confirm out
  loud first; only after they clearly say yes, call the tool with confirm=true.
- If a tool returns an error, tell the user plainly. Spell out dates naturally.

Today's date is {today}."""


def _live_tools() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=t.name, description=t.description, parameters_json_schema=t.parameters
            )
            for t in toolmod.TOOLS
        ]
    )


def authenticate(token: str, org_id_raw: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    """Validate the session token + org membership for a voice connection.
    Returns (user_id, org_id) or None. Mirrors deps.org_context."""
    if not token or not org_id_raw:
        return None
    try:
        org_id = uuid.UUID(str(org_id_raw))
    except ValueError:
        return None
    db = SessionLocal()
    try:
        resolved = auth_service.resolve_session(db, token)
        if resolved is None:
            return None
        _session, user = resolved
        set_current_user(db, user.id)
        set_current_org(db, org_id)
        if not authz.is_org_member(db, user.id, org_id):
            return None
        return user.id, org_id
    except Exception:  # noqa: BLE001
        return None
    finally:
        db.close()


def _run_tool_sync(user_id: uuid.UUID, org_id: uuid.UUID, name: str, args: dict):
    """Execute one tool in a fresh, tenant-scoped DB session (sync; run via a
    thread so it never blocks the event loop)."""
    db = SessionLocal()
    try:
        set_current_user(db, user_id)
        set_current_org(db, org_id)
        user = db.get(User, user_id)
        if user is None:
            return {"error": "User not found."}
        ctx = ToolContext(db=db, user=user, org_id=org_id)
        result = toolmod.invoke(ctx, name, args)
        db.commit()
        return result
    except Exception as e:  # noqa: BLE001
        db.rollback()
        return {"error": f"Tool failed: {e}"}
    finally:
        db.close()


async def bridge(ws, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """Run a full voice session: relay audio both ways and service tool calls.

    `ws` is a Starlette/FastAPI WebSocket (already accepted + authenticated).
    Client → server frames: binary = PCM16@16k mic audio; text JSON =
      {"type":"text","text":...} (typed fallback) or {"type":"stop"}.
    Server → client: binary = PCM16@24k audio to play; JSON events =
      transcript / interrupted / turn_complete / ready / error.
    """
    from starlette.websockets import WebSocketDisconnect, WebSocketState

    from app.db.base import utcnow

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        input_audio_transcription={},
        output_audio_transcription={},
        system_instruction=SYSTEM_PROMPT.format(today=utcnow().date().isoformat()),
        tools=[_live_tools()],
    )

    async with client.aio.live.connect(model=settings.GEMINI_LIVE_MODEL, config=config) as session:
        await ws.send_json({"type": "ready"})

        async def uplink() -> None:
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    return
                if msg.get("bytes") is not None:
                    await session.send_realtime_input(
                        audio=types.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000")
                    )
                elif msg.get("text") is not None:
                    data = json.loads(msg["text"])
                    kind = data.get("type")
                    if kind == "text" and data.get("text"):
                        await session.send_client_content(
                            turns={"role": "user", "parts": [{"text": data["text"]}]},
                            turn_complete=True,
                        )
                    elif kind == "stop":
                        return

        async def downlink() -> None:
            # session.receive() ends at each turn_complete; loop to keep the
            # conversation going continuously until the client disconnects.
            while True:
                async for response in session.receive():
                    if response.data:
                        await ws.send_bytes(response.data)

                    sc = response.server_content
                    if sc:
                        if sc.input_transcription and sc.input_transcription.text:
                            await ws.send_json(
                                {"type": "transcript", "role": "user", "text": sc.input_transcription.text}
                            )
                        if sc.output_transcription and sc.output_transcription.text:
                            await ws.send_json(
                                {"type": "transcript", "role": "assistant", "text": sc.output_transcription.text}
                            )
                        if sc.interrupted:
                            await ws.send_json({"type": "interrupted"})
                        if sc.turn_complete:
                            await ws.send_json({"type": "turn_complete"})

                    if response.tool_call and response.tool_call.function_calls:
                        responses = []
                        for fc in response.tool_call.function_calls:
                            result = await asyncio.to_thread(
                                _run_tool_sync, user_id, org_id, fc.name, dict(fc.args or {})
                            )
                            responses.append(
                                types.FunctionResponse(
                                    id=fc.id, name=fc.name, response={"result": result}
                                )
                            )
                        await session.send_tool_response(function_responses=responses)

        up = asyncio.create_task(uplink())
        down = asyncio.create_task(downlink())
        try:
            _done, pending = await asyncio.wait({up, down}, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
        except WebSocketDisconnect:
            for t in (up, down):
                t.cancel()
        finally:
            if ws.client_state == WebSocketState.CONNECTED:
                try:
                    await ws.send_json({"type": "closed"})
                except Exception:  # noqa: BLE001
                    pass
