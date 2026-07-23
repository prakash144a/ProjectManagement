# Roadmap & Next Milestones

_Living plan for resuming work across sessions. Last updated 2026-07-22._

## Status — done & committed
Phase 1 GUI · Phase 2 chat agent + **A1 retrieval** (pgvector, live) · Phase 3 **voice**
(Gemini Live) · design-system passes 1–2 · dedicated `/chat` page + localStorage
persistence · **standalone MCP server + Personal Access Tokens** · **Azure Container
Apps deployment files** (`infra/`). Runs locally as 3 processes: REST `:8000`,
MCP `:8100`, web `:3000`. Models: `gemini-flash-latest` (chat),
`gemini-2.5-flash-native-audio-latest` (voice), `gemini-embedding-001` @768 (retrieval).

---

## ▶ IMMEDIATE / IN PROGRESS: Email OTP delivery
**Decision:** email-first, **Azure Communication Services (ACS)**. SMS deferred.
**Why:** prod-login blocker — today OTP codes are only logged (`DEV_OTP_ECHO`); the
OTP itself (generate/hash/store/expiry/attempt-caps/rate-limits) is already built.
Only *delivery* is missing.

**Owner setup (Azure) — needed for live test:**
1. Create an **Azure Communication Services** resource.
2. Add an **Email Communication Service** + a **verified sender domain** (the
   Azure-managed subdomain is the quick option; custom domain needs DNS/SPF/DKIM).
3. Put in `.env` (local) / Key Vault (prod):
   - `ACS_EMAIL_CONNECTION_STRING=...`
   - `ACS_EMAIL_SENDER=DoNotReply@<your-verified-domain>`

**Build (code) — was about to start:**
- `pip install azure-communication-email`; add to `backend/pyproject.toml`.
- `config.py`: add `ACS_EMAIL_CONNECTION_STRING`, `ACS_EMAIL_SENDER`, `APP_NAME`,
  and an `email_enabled` property (`bool(conn_str and sender)`).
- New `app/services/messaging.py` → `deliver_otp(channel, target, code)`:
  ACS email if configured (`EmailClient.from_connection_string`, `begin_send` +
  `poller.result()`), else **dev-log fallback**. Returns whether a provider was used;
  raises on provider send failure.
- Wire `auth_service.request_code` to call `messaging.deliver_otp` (replace the inline
  log). On provider failure → clear error ("couldn't send code, try again");
  transaction rolls back so no orphaned code. Keep `DEV_OTP_ECHO` echo intact.
- `.env.example`: add the two `ACS_EMAIL_*` vars.
- Verify: existing tests still pass (no provider → console fallback + `dev_code`);
  unit-test message building; live-test once owner adds ACS creds.
- **SMS** later behind the same interface (Twilio or ACS SMS; needs a number +
  A2P/toll-free registration + per-msg cost).

---

## Milestone backlog (priority order)
1. **Email OTP** (above) — unblocks prod login.
2. **DB hardening — least-privilege app role.** `prakash` has `BYPASSRLS`, so RLS is
   inert. Create a role WITHOUT bypassrls, grant table privileges, point
   `DATABASE_URL` at it → RLS actually enforces tenant isolation.
3. **Azure deployment.** Fill placeholders (subscription id, resource group, ACR name)
   in `infra/deploy.sh`/`main.parameters.json`; run `infra/deploy.sh`; then
   `alembic upgrade head` in the api container. Custom domains recommended (stable
   `NEXT_PUBLIC_*` build args). See `infra/DEPLOY.md`.
4. **DB-backed chat history** (the deferred "server-side, later"): `conversation` +
   `message` tables (RLS), list/reopen past chats, cross-device. Replaces the current
   per-device localStorage single conversation.
5. **Per-workspace AI on/off flag** + per-workspace model endpoint (compliance
   escape-hatch). AI is always-on today.
6. **MCP OAuth 2.1** — one-click Claude/ChatGPT connect (PAT is built; OAuth is the
   consumer-client upgrade).
7. **SMS OTP** — second channel (Twilio/ACS SMS).
8. **Mobile app** — React Native / Expo (calls REST; store-distributed).
9. **Billing** — Stripe on the Organization boundary.
10. **Design polish** — avatars + greeting, 3-column dashboard w/ right insights panel,
    per-KPI trend deltas, restyle remaining components (TaskDetail, comments, bell,
    filter bar). _(AI executive-summary strip was declined.)_
11. **North-star (only if asked):** autonomous scheduled prompts; realtime/eventing.

---

## Owner action checklist (external dependencies)
- [ ] **ACS** resource + email domain + connection string + sender → `.env`
- [ ] **Azure deploy**: subscription id, resource group, ACR name
- [ ] **DB**: create least-privilege role (no `BYPASSRLS`), grant, new `DATABASE_URL`
- [x] `VECTOR` allow-listed in `azure.extensions` (done — A1 live)
- [ ] **SMS** provider + number (later)
- [ ] **Stripe** account (later, billing)

## Standing context / gotchas
- Run backend **without `--reload`** (it stalls); restart manually after backend edits.
- **Two backend processes**: REST `uvicorn app.main:app` (:8000), MCP
  `uvicorn mcp_server.server:app` (:8100). Frontend `npm run dev` (:3000).
- **Gemini free-tier limits**: chat ~5 req/min, plus embedding/Live quotas → paid tier
  for real load. Pinned `gemini-2.5-flash` is blocked for new keys; use `-latest` aliases.
- Secrets live only in gitignored `.env` (never committed; `.env.example` is the template).
- Migrations are additive now (`0001` baseline metadata; `0002` pgvector; `0003` PAT).
