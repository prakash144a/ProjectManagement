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
- `infra/oneTimeScripts/kvSecrets_Prod.sh` — **one-time** secret bootstrap for prod
  (Key Vault + identity + secrets). One file per environment lives in `oneTimeScripts/`.
- `infra/main.bicep` — the Container Apps environment + 3 apps.
- `infra/main.parameters.json` — non-secret params (**fill the `CHANGEME`s**).
- `infra/deploy.sh` — ensure ACR → build → push → deploy → wire URLs.

## Secrets model (Key Vault)
Secret **values** are never committed and never passed to the deploy CLI. You upload
them once to Key Vault with the environment's `kvSecrets_*.sh`; the `api` container app reads them at
runtime through a **user-assigned managed identity** (granted `Key Vault Secrets User`).

| Secret (vault name) | Source |
|---|---|
| `database-url` | your Azure Postgres connection string |
| `gemini-api-key` | your Gemini key |
| `acs-email-connection-string` | Azure Communication Services email connection string |

The **ACS sender address** (`ACS_EMAIL_SENDER`) is *not* secret — it's a plain deploy
param. `mcp` and `web` hold no secrets.

## Fill in these placeholders
In `deploy.sh` / `oneTimeScripts/kvSecrets_Prod.sh` (or export as env vars) and `main.parameters.json`:
- `SUBSCRIPTION` — Azure subscription id
- `RESOURCE_GROUP` — target resource group
- `LOCATION` — e.g. `westus`
- `ACR_NAME` — container registry name (globally unique, alphanumeric). **Auto-created**
  by `deploy.sh` if it doesn't exist (Basic tier, admin enabled).
- `NAME_PREFIX` — resource name prefix (default `pmapp`)
- `ACS_EMAIL_SENDER` — verified ACS sender, e.g. `DoNotReply@<domain>.azurecomm.net`

## Deploy
```bash
az login
az extension add -n containerapp --upgrade
# ACR_NAME must be globally unique + alphanumeric; deploy.sh creates it if missing.
export SUBSCRIPTION=... RESOURCE_GROUP=... LOCATION=westus ACR_NAME=...

# 1) One-time: create the vault + identity + secrets (export the secret VALUES first).
export DATABASE_URL='postgresql://...'  GEMINI_API_KEY='...'  \
       ACS_EMAIL_CONNECTION_STRING='endpoint=https://...;accesskey=...'
bash infra/oneTimeScripts/kvSecrets_Prod.sh
# → prints KEY_VAULT_NAME and USER_ASSIGNED_IDENTITY_ID to export next.

# 2) Deploy (references the vault; no secret values on the CLI).
export KEY_VAULT_NAME='pmapp-kv'  USER_ASSIGNED_IDENTITY_ID='/subscriptions/.../userAssignedIdentities/pmapp-id'
export ACS_EMAIL_SENDER='DoNotReply@<your-verified-domain>'
bash infra/deploy.sh
```
`kvSecrets_Prod.sh` is idempotent — re-run it only to rotate a secret value.
`deploy.sh` builds the backend image, deploys api+mcp, reads their URLs, builds the
frontend image with those URLs, then points the web app at it and fixes CORS.

## After the first deploy
1. **Run migrations** (needs `VECTOR` allow-listed in `azure.extensions` for 0002):
   ```bash
   az containerapp exec -g <rg> -n pmapp-api --command "alembic upgrade head"
   ```

## ⚠️ Before this is a usable production system
These are known gaps (tracked as milestones), not deployment bugs:

- **Email OTP delivery is wired** (Azure Communication Services; `ACS_EMAIL_*`). Confirm
  `DEV_OTP_ECHO=false` (set here) and that the vault holds `acs-email-connection-string`
  with a verified sender, so email users can log in. **SMS OTP is still not wired** — mobile
  identifiers can't receive codes yet (deferred milestone).
- **DB role bypasses RLS.** The app connects as the Postgres owner, which has `BYPASSRLS`,
  so row-level security is currently inert. Create a **least-privilege app role (no
  BYPASSRLS)** and point `DATABASE_URL` at it so RLS actually enforces tenant isolation.
- **Registry auth** uses admin credentials for simplicity; prefer using the same
  **user-assigned managed identity with `AcrPull`** (the identity already exists) for
  production, and drop the admin password.
- **MCP auth** is Personal Access Tokens; add **OAuth 2.1** later for one-click Claude/ChatGPT
  connect.
- Consider **custom domains** (`api.`, `mcp.`, `app.`) so the frontend build URLs are stable.
