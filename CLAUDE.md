# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase-1 backend implementation has begun under `backend/` (FastAPI modular monolith). It implements the
first vertical slice: **custom passwordless OTP auth** + **Organization → Workspace → Project → Task**,
with authorization + audit centralized in the REST layer and **PostgreSQL row-level security** on every
org-scoped table. There is **no frontend yet** (the Next.js GUI is the next milestone). A prior Phase 1
prototype (`pm_app/`, stdlib HTTP + SQLite) existed under commit `b511d01` but was removed — do not
assume `pm_app/`, the old `tests/`, or `pm_phase1.sqlite3` exist.

Layout: `backend/app/{config.py,db,core,models,schemas,services,api}`, `backend/migrations` (Alembic),
`backend/tests`, `backend/scripts/smoke.py`. Business logic + authorization live in `app/services`
(`authz.py` is the single permission resolver); routers are thin. RLS context is set per request in
`app/db/session.py` + `app/api/deps.py` (`org_context` reads the `X-Org-Id` header).

### Setup, run, test (local; run from `backend/`)

- **Install**: from repo root, `python -m venv .venv` → activate → `pip install -e "./backend[dev]"`.
- **Config**: reads the gitignored repo-root `.env` (owner's Azure Postgres `DATABASE_URL`); `config.py`
  normalizes the scheme to `postgresql+psycopg://`. Connecting requires the client IP to be allow-listed
  in the Azure Postgres firewall (a **dynamic IP means this rule goes stale** and must be re-added).
- **Migrate**: `alembic upgrade head` (initial migration builds all tables from model metadata, then
  applies RLS `ENABLE`/`FORCE` + policies). New model changes: `alembic revision --autogenerate -m "..."`.
- **Run**: `uvicorn app.main:app --reload` → Swagger at `/docs`.
- **Smoke** (server running): `python scripts/smoke.py`.
- **Tests**: `pytest` — commits to the configured DB using unique identifiers per run; created orgs are
  cleaned up (cascade) at session end. Both migrations and tests need live DB connectivity.

RLS note: the app connects as the DB **owner** (`prakash`), so policies use `FORCE ROW LEVEL SECURITY`;
`app.current_org_id` / `app.current_user_id` GUCs (set via `set_config(..., is_local => true)`) drive the
policies and fail closed when unset. A dedicated least-privilege app role is deferred to deploy hardening.

## Product and architecture direction

Three design docs exist. The **finalized architecture** is split across two companion docs that take
precedence:
- **`docs/ai-native-system-design.md`** — architecture + tech stack. Read this in full before
  implementation; it reflects a component-by-component design review with the project owner.
- **`docs/ai-native-data-model.md`** — the domain-level data model (entities, ER diagram, tenancy). The
  **Phase-1 model is finalized** (reconciled with the system design). Everything is Phase 1 unless tagged
  [P2], [★ north-star], [defer], or [later].

`docs/ai-native-task-management-architecture.md` is the original (authored by the project owner); its
product vision and stack shortlist still hold, but where it differs on architecture, the system-design
doc wins.

Finalized architecture (from the design review):

- **Product**: an AI-first, **GUI-first** task management SaaS (competing with Asana/ClickUp/Linear/
  Motion/Todoist/Notion/Monday), with an always-available natural-language layer (chat now, voice later)
  and MCP for external AI clients.
- **The one API is REST.** The REST API holds **all business logic, authorization, and audit** — the
  single enforcement point. Every surface converges on it: GUI and Public API call REST directly; chat/
  voice go through an **AI agent service** that calls tools **via MCP → REST**; external AI clients call
  **MCP → REST**. No surface touches the DB or business logic directly. Do NOT build a parallel/second
  API or put authorization anywhere but REST.
- **Auth**: **custom passwordless OTP** (NOT a managed provider — this was changed by the owner). User
  identifies with username/email/mobile → one-time code to email or mobile → **Session** token valid N
  days. Entities: `User` (unique username/email/mobile), `OneTimeCode`, `Session`. In-house auth means we
  own OTP expiry, per-identifier/IP rate limits, attempt caps, SMS-pumping protection. Needs an SMS +
  email provider (console-print codes in dev). The authN/authZ split is unchanged: **authentication** at
  every entry (GUI→REST included), **authorization** only in REST; the agent **acts as the user**
  (identity propagates agent→MCP→REST), **no standing privileges**; chat edge does authN + rate-limit +
  coarse check before any LLM call.
- **MCP** wraps REST as a first-class surface; the chat agent dogfoods it (reaches tools only via MCP).
- **AI brain**: **Gemini function calling** (single provider for now, but model endpoint configurable and
  chosen **per workspace** as a compliance escape-hatch). **One general chat agent**, simple tool-calling
  loop, **current-conversation memory only**, thin chat client (agent service holds all tools). Gemini is
  the only component outside the Azure boundary; task content is sent raw for now (documented gap).
- **Destructive/bulk safety**: agent asks "are you sure?" (UX) and, on yes, sets `confirm: true`; REST
  **requires `confirm: true`** on destructive/bulk tools and rejects any call without it (unbypassable by
  any caller).
- **Stack**: Next.js/TS (web), React Native/Expo (mobile), Python + FastAPI **modular monolith** (REST +
  MCP module + agent service), PostgreSQL + pgvector (RLS mandatory), Azure (Container Apps, Postgres,
  Blob, Key Vault, Monitor), Stripe, managed auth provider. **Avoid** Kubernetes, Kafka, Temporal,
  GraphQL, microservices. Redis/WebSocket, Meilisearch, and Celery/scheduler are **deferred until needed**.
- **Data model** (Phase 1, see data-model doc): **Organization = tenant + billing boundary** (RLS on
  `organization_id`); **Workspace** is a logical container inside the org (Org → Workspace → Project →
  TaskGroup → Task). **User is global** (joins orgs via OrgMembership). Permissions = **AccessGrant**
  (principal User|Group × scope Org|Workspace|Project × fixed Role: Owner/Admin/Member/Viewer), inherited
  downward, additive. **Group** has `type` team|custom; creating a Workspace/Project auto-grants the
  creator's *team*-groups only. **Status** is an org-level catalog (Owner-managed, `is_completed` marker);
  **TaskGroup** has no stored status (runtime rollup). **Single assignee**, **no custom fields**.
- **Phases**: **P1** GUI + REST(+authz+audit) + PostgreSQL + auth → **P2** MCP + agent (chat) + retrieval
  ("ask anything") + workspace AI on/off flag → **P3** voice (Gemini Live) + mobile.
- **★ North-star (designed, NOT built now)**: **autonomous agents** (generic *scheduled prompts* — attach
  a schedule to any NL prompt; runs as the configuring user; skips unsafe actions) and **realtime &
  eventing** (users refresh for now). Do not build these unless explicitly asked; confirm the phase before
  adding later-phase functionality.
- **Still open**: auth vendor (Auth0/WorkOS/Entra), target segment, Public API scope/versioning, MCP
  access tier. If a task depends on one of these, surface the ambiguity rather than assuming an answer.
