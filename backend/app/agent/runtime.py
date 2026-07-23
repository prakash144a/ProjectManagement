"""The chat agent: a Gemini function-calling loop over the in-process tool layer.

One general assistant, simple tool-calling loop, current-conversation memory only
(the client sends the prior turns back each request). The agent reaches data only
through `agent.tools` — i.e. MCP → REST — so it acts as the user with no standing
privileges, and destructive actions still require an explicit `confirm=true`.
"""

from __future__ import annotations

import logging

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.agent import tools as toolmod
from app.agent.tools import ToolContext
from app.config import settings
from app.db.base import utcnow

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are the assistant inside an AI-native task-management app (like Asana/Linear).
You help the user manage teams, projects, and tasks by calling the provided tools.

Guidelines:
- You act AS the current user. You can only see and change what they're allowed to;
  if a tool returns an error (e.g. permission denied), relay it plainly.
- Tools work with ids, not names. Before creating or updating something, use the
  list_* tools to resolve the right team/project/status/assignee id. Never invent ids.
- To mark a task done, set its status to one where is_completed is true (find it via
  list_statuses). Dates are ISO format, YYYY-MM-DD.
- DESTRUCTIVE or bulk actions (e.g. delete_task): first ask the user to confirm in
  plain language. Only after they clearly agree, call the tool with confirm=true.
  Never set confirm=true on your own initiative.
- Be concise. Confirm what you did with the concrete result (task title, status, etc.).
  If you couldn't do something, say why. Ask a brief clarifying question when the
  request is ambiguous rather than guessing.

Today's date is {today}."""


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _tools_config() -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=t.name,
                description=t.description,
                parameters_json_schema=t.parameters,
            )
            for t in toolmod.TOOLS
        ]
    )


def _text_of(parts) -> str:
    return "".join(p.text for p in parts if getattr(p, "text", None)).strip()


def _model_error_message(e: genai_errors.APIError) -> str:
    """A friendly, user-facing message for a Gemini API failure (so it surfaces
    as an assistant reply, not a 500)."""
    code = getattr(e, "code", None)
    if code == 429:
        return (
            "I'm being rate-limited by the model right now (quota exceeded). "
            "Please wait a few seconds and try again."
        )
    if code in (500, 503):
        return "The model is temporarily unavailable. Please try again in a moment."
    return "Sorry — I hit an error talking to the model. Please try again."


def run(
    ctx: ToolContext, history: list[dict], message: str
) -> tuple[str, list[dict]]:
    """Run one user message through the tool-calling loop.

    `history` is prior turns as {role: 'user'|'assistant', content: str}. Returns
    the assistant's reply text and a trace of the tool calls it made (for the UI)."""
    client = _get_client()

    contents: list[types.Content] = []
    for m in history:
        text = (m.get("content") or "").strip()
        if not text:
            continue
        role = "model" if m.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=text)]))
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT.format(today=utcnow().date().isoformat()),
        tools=[_tools_config()],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.2,
    )

    actions: list[dict] = []
    for _ in range(settings.AGENT_MAX_STEPS):
        try:
            resp = client.models.generate_content(
                model=settings.GEMINI_MODEL, contents=contents, config=config
            )
        except genai_errors.APIError as e:
            log.warning("Gemini API error: %s %s", getattr(e, "code", "?"), e)
            return _model_error_message(e), actions
        cand = (resp.candidates or [None])[0]
        if cand is None or cand.content is None:
            return "Sorry — I couldn't produce a response.", actions

        parts = cand.content.parts or []
        calls = [p.function_call for p in parts if getattr(p, "function_call", None)]
        if not calls:
            return _text_of(parts) or "(no response)", actions

        contents.append(cand.content)  # the model's function-call turn
        response_parts = []
        for fc in calls:
            args = dict(fc.args or {})
            result = toolmod.invoke(ctx, fc.name, args)
            ok = not (isinstance(result, dict) and "error" in result)
            actions.append({"tool": fc.name, "ok": ok})
            response_parts.append(
                types.Part.from_function_response(name=fc.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=response_parts))

    return (
        "I've done as much as I safely can in one go — could you refine or narrow the request?",
        actions,
    )
