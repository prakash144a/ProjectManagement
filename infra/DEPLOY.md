# Deployment (Azure Container Apps)

Three separate apps in one Container Apps environment, from **two images**:

| App | Image | Command | Public port |
|-----|-------|---------|-------------|
| `pmapp-api` | `pm-backend` | *(default)* `uvicorn app.main:app` | 8000 |
| `pmapp-mcp` | `pm-backend` | `uvicorn mcp_server.server:app` | 8100 |
| `pmapp-web` | `pm-frontend` | `node server.js` | 3000 |

- **api** holds all business logic, authz, audit, chat + voice.
- **mcp** is a thin proxy → calls **api** over HTTP (`MCP_REST_URL`); no DB, no secrets.
- **web** is the Next.js UI; its API/MCP URLs are **baked at image build time**.
- **Mobile** is not deployed here — it's a store app that calls the `api` URL.
- **Postgres** is your existing Azure Postgres (passed as `DATABASE_URL`), not provisioned here.

## Files
- `backend/Dockerfile`, `frontend/Dockerfile` — the two images.
- `infra/main.bicep` — the Container Apps environment + 3 apps.
- `infra/main.parameters.json` — non-secret params (**fill the `CHANGEME`s**).
- `infra/deploy.sh` — build → push → deploy → wire URLs.

## Fill in these placeholders (you'll provide later)
In `deploy.sh` (or export as env vars) and `main.parameters.json`:
- `SUBSCRIPTION` — Azure subscription id
- `RESOURCE_GROUP` — target resource group
- `LOCATION` — e.g. `eastus`
- `ACR_NAME` — your Azure Container Registry name
- `NAME_PREFIX` — resource name prefix (default `pmapp`)

Secrets — **export, don't commit**:
- `DATABASE_URL` — your Azure Postgres connection string
- `GEMINI_API_KEY` — your Gemini key

## Deploy
```bash
az login
az extension add -n containerapp --upgrade
export DATABASE_URL='postgresql://...'   GEMINI_API_KEY='...'
export SUBSCRIPTION=... RESOURCE_GROUP=... ACR_NAME=...
bash infra/deploy.sh
```
The script: builds the backend image, deploys api+mcp, reads their URLs, builds the
frontend image with those URLs, then points the web app at it and fixes CORS.

## After the first deploy
1. **Run migrations** (needs `VECTOR` allow-listed in `azure.extensions` for 0002):
   ```bash
   az containerapp exec -g <rg> -n pmapp-api --command "alembic upgrade head"
   ```

## ⚠️ Before this is a usable production system
These are known gaps (tracked as milestones), not deployment bugs:

- **OTP delivery is not wired.** `DEV_OTP_ECHO=false` in prod (correct), but there's no
  SMS/email provider yet, so **codes are only logged — users cannot receive them and
  cannot log in**. Wire an SMS + email provider before real users. (This is the deferred
  "Real OTP delivery" milestone.)
- **DB role bypasses RLS.** The app connects as the Postgres owner, which has `BYPASSRLS`,
  so row-level security is currently inert. Create a **least-privilege app role (no
  BYPASSRLS)** and point `DATABASE_URL` at it so RLS actually enforces tenant isolation.
- **Registry auth** uses admin credentials for simplicity; prefer a **user-assigned managed
  identity with `AcrPull`** for production.
- **Secrets** are passed as container secrets; moving them to **Key Vault** (referenced via
  managed identity) is the hardening step.
- **MCP auth** is Personal Access Tokens; add **OAuth 2.1** later for one-click Claude/ChatGPT
  connect.
- Consider **custom domains** (`api.`, `mcp.`, `app.`) so the frontend build URLs are stable.
