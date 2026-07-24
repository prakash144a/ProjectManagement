# Roadmap & Next Milestones

_Living plan for resuming work across sessions. Last updated 2026-07-23 (chat history + design
polish shipped; per-workspace AI flag dropped)._

## Status — done & committed
Phase 1 GUI · Phase 2 chat agent + **A1 retrieval** (pgvector, live) · Phase 3 **voice**
(Gemini Live) · **DB-backed multi-conversation chat history** · `/chat` page ·
**standalone MCP server + Personal Access Tokens** · **email OTP delivery** (ACS) ·
**deployed & live on Azure Container Apps** · **design polish** (resizable panels, right-docked
chat, icon-rail sidebar, restyled TaskDetail/comments/bell/filter bar).
Models: `gemini-flash-latest` (chat), `gemini-2.5-flash-native-audio-latest` (voice),
`gemini-embedding-001` @768 (retrieval).

**✅ Live (2026-07-23)** — Azure Container Apps, RG `ProjectManagement`, westus, prefix
`pmapp144`. Verified end-to-end (prod OTP request → Postgres → Key Vault secret → ACS email).
- web: `https://pmapp144-web.niceriver-14f262ea.westus.azurecontainerapps.io`
- api: `https://pmapp144-api.niceriver-14f262ea.westus.azurecontainerapps.io`
- mcp: `https://pmapp144-mcp.niceriver-14f262ea.westus.azurecontainerapps.io/mcp`
Deploy = `infra/oneTimeScripts/kvSecrets_Prod.sh` (gitignored; KV+identity+secrets from
`.env`) then `infra/deploy.sh` (ACR+images+Bicep). Windows/Git-Bash az gotchas captured
in the `deployment` memory + `infra/DEPLOY.md`.

**✅ Email OTP delivery** — `app/services/messaging.py` → `deliver_otp()` sends via ACS when
configured, else dev-logs; wired into `auth_service.request_code`; send failure rolls the
request back. SMS stubbed behind the same interface (dev-logs in dev, raises in prod).

---

## Next milestones

### A. Post-launch hardening (do soon — prod is live)
1. **Least-privilege DB role** _(top priority — real security gap)._ `prakash` has
   `BYPASSRLS` → RLS is inert. New role without bypassrls + table grants, point
   `DATABASE_URL` at it → tenant isolation actually enforced.
2. **Tighten DB firewall** — remove the wide-open `AllowAll` (0.0.0.0–255.255.255.255)
   rule on `pmdb`; env egress IP `20.237.136.97` already allow-listed (`containerapps-pmapp144`).
3. **Registry/identity hardening** — ACR pulls from admin creds → managed identity `AcrPull`; drop admin password.
4. **Separate prod DB** — prod shares the Azure Postgres with dev/tests today.
5. **Custom domains** — `app.`/`api.`/`mcp.` for stable URLs (also removes frontend rebuild-on-URL friction).

### B. Feature backlog (priority order)
6. **MCP OAuth 2.1** — one-click Claude/ChatGPT connect (PAT built; OAuth is the upgrade).
7. **SMS OTP** — second channel (Twilio/ACS SMS; needs number + A2P/toll-free registration).
8. **Mobile app** — React Native / Expo (calls the live api URL; store-distributed).
9. **Billing** — Stripe on the Organization boundary.

_Done:_ ✅ **DB-backed chat history** · ✅ **Design polish** (resizable/docked panels, icon-rail
sidebar, restyled TaskDetail/comments/bell/filter bar). _Dropped:_ ~~Per-workspace AI on/off
flag~~ — no longer required. _(AI exec-summary strip also declined.)_

### C. North-star (only if asked)
10. **Autonomous scheduled prompts** (schedule any NL prompt; runs as the user; skips unsafe actions).
11. **Realtime & eventing** (live updates instead of refresh).

---

## Owner action checklist (external dependencies)
- [x] **ACS** email (resource + verified sender + creds) — live-verified 2026-07-23
- [x] **Azure deploy** — live (sub `94c9f619-…`, RG `ProjectManagement`, ACR `pmapp144`)
- [x] `VECTOR` allow-listed in `azure.extensions` (A1 live)
- [ ] **DB**: least-privilege role (no `BYPASSRLS`), grant, new `DATABASE_URL`
- [ ] **DB firewall**: remove `AllowAll` rule on `pmdb`
- [ ] **SMS** provider + number (later)
- [ ] **Stripe** account (later, billing)

## Standing context / gotchas
- **Prod deploy** needs Windows + `az.cmd` via Git Bash/PowerShell, MFA login
  (`--tenant c6d76bd5-…`); scripts handle MSYS path conversion, `az acr build --no-logs`,
  RBAC `--subscription`, `Microsoft.App` provider registration. See `deployment` memory.
- Local backend: run **without `--reload`** (stalls); REST `:8000`, MCP `:8100`, web `:3000`.
- **Gemini free-tier limits**: chat ~5 req/min; use `-latest` model aliases (pinned names blocked for new keys).
- Secrets only in gitignored `.env` (`.env.example` is the template); prod secrets in Key Vault `pmapp144-kv`.
- Migrations additive: `0001` baseline · `0002` pgvector · `0003` PAT (DB at head).
