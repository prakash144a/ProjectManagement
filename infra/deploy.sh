#!/usr/bin/env bash
# Deploy the app (api + mcp) and web to Azure Container Apps.
#
# Prereqs: az CLI logged in (`az login`) and the containerapp extension
# (`az extension add -n containerapp`). The container registry (ACR) is created
# automatically below if it doesn't already exist.
#
# Fill in the CHANGEME placeholders (or export them as env vars) before running.
#
# App secrets live in Key Vault — run the environment's one-time bootstrap ONCE first
# (prod: `infra/oneTimeScripts/kvSecrets_Prod.sh`), then export the KEY_VAULT_NAME +
# USER_ASSIGNED_IDENTITY_ID it prints. No secret VALUES are passed here (only the ACR
# password, fetched below at deploy time).
set -euo pipefail

# `az acr build` streams the cloud build logs back to the client; on Windows the
# CLI can crash encoding non-cp1252 characters (UnicodeEncodeError in colorama).
# Force UTF-8 for the CLI's Python I/O so log streaming can't kill the deploy.
export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

# ---- FILL THESE IN (or export before running) -------------------------------
SUBSCRIPTION="${SUBSCRIPTION:-CHANGEME-subscription-id}"
RESOURCE_GROUP="${RESOURCE_GROUP:-CHANGEME-resource-group}"
LOCATION="${LOCATION:-westus}"
ACR_NAME="${ACR_NAME:-CHANGEME}"            # registry name (no .azurecr.io); globally unique, alphanumeric, 5-50 chars
NAME_PREFIX="${NAME_PREFIX:-pmapp}"

# Key Vault references (from kvSecrets_Prod.sh) + non-secret ACS sender:
KEY_VAULT_NAME="${KEY_VAULT_NAME:?run infra/oneTimeScripts/kvSecrets_Prod.sh first, then export KEY_VAULT_NAME}"
USER_ASSIGNED_IDENTITY_ID="${USER_ASSIGNED_IDENTITY_ID:?export USER_ASSIGNED_IDENTITY_ID (printed by kvSecrets_Prod.sh)}"
ACS_EMAIL_SENDER="${ACS_EMAIL_SENDER:?export ACS_EMAIL_SENDER=DoNotReply@<your-verified-domain>}"
# -----------------------------------------------------------------------------

# ACR name must be set + globally unique (alphanumeric only); it becomes <name>.azurecr.io.
case "$ACR_NAME" in
  ''|*CHANGEME*) echo "ERROR: set ACR_NAME to a globally-unique alphanumeric registry name (5-50 chars)." >&2; exit 1;;
esac

REGISTRY="${ACR_NAME}.azurecr.io"
BACKEND_IMAGE="${REGISTRY}/pm-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/pm-frontend:latest"

# On Git Bash (Windows), MSYS mangles two different kinds of args in opposite ways:
# it wrongly rewrites ARM resource ids (/subscriptions/...) AND, if we disable that,
# it stops rewriting the local build paths that native `az` needs in Windows form.
# Resolve both: turn conversion OFF, and hand `az` local paths already in Windows
# (mixed-slash) form via cygpath. On Linux/macOS this whole block is a no-op.
if command -v cygpath >/dev/null 2>&1; then
  export MSYS_NO_PATHCONV=1
  REPO_ROOT="$(cygpath -m "$(cd "$(dirname "$0")/.." && pwd)")"
else
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

az account set --subscription "$SUBSCRIPTION"

echo "==> 1/6 Ensure container registry $ACR_NAME (Basic, admin enabled)"
if ! az acr show -n "$ACR_NAME" -o none 2>/dev/null; then
  echo "    registry not found — creating $ACR_NAME in $RESOURCE_GROUP ($LOCATION)…"
  az acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" -l "$LOCATION" --sku Basic --admin-enabled true -o none
fi
# Ensure admin credentials are on (deploy + Container Apps pull use username/password).
az acr update -n "$ACR_NAME" --admin-enabled true -o none
ACR_PASSWORD="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
ACR_USER="$(az acr credential show -n "$ACR_NAME" --query 'username' -o tsv)"

echo "==> 2/6 Build backend image in ACR"
# --no-logs: still queues + waits for the build (real exit code), but skips the log
# streaming that crashes az on Windows (colorama encodes Unicode build output as
# cp1252). To debug a failed build, drop --no-logs or run: az acr task logs -r <acr>.
az acr build -r "$ACR_NAME" -t "pm-backend:latest" "$REPO_ROOT/backend" --no-logs

echo "==> 3/6 Deploy api + mcp (frontend uses a placeholder image for now)"
az deployment group create --only-show-errors \
  -g "$RESOURCE_GROUP" -f "$REPO_ROOT/infra/main.bicep" \
  -p "$REPO_ROOT/infra/main.parameters.json" \
  -p namePrefix="$NAME_PREFIX" location="$LOCATION" \
     registryServer="$REGISTRY" registryUsername="$ACR_USER" registryPassword="$ACR_PASSWORD" \
     backendImage="$BACKEND_IMAGE" \
     keyVaultName="$KEY_VAULT_NAME" userAssignedIdentityId="$USER_ASSIGNED_IDENTITY_ID" \
     acsEmailSender="$ACS_EMAIL_SENDER" \
     corsOrigins="https://placeholder"

API_URL="$(az deployment group show -g "$RESOURCE_GROUP" -n main --query properties.outputs.apiUrl.value -o tsv)"
MCP_URL="$(az deployment group show -g "$RESOURCE_GROUP" -n main --query properties.outputs.mcpUrl.value -o tsv)"
echo "    api: $API_URL"
echo "    mcp: $MCP_URL"

echo "==> 4/6 Run DB migrations (once VECTOR is allow-listed in azure.extensions)"
echo "    az containerapp exec -g $RESOURCE_GROUP -n ${NAME_PREFIX}-api --command 'alembic upgrade head'"

echo "==> 5/6 Build frontend image with the real API/MCP URLs baked in"
az acr build -r "$ACR_NAME" -t "pm-frontend:latest" \
  --build-arg NEXT_PUBLIC_API_BASE="$API_URL" \
  --build-arg NEXT_PUBLIC_MCP_URL="$MCP_URL" \
  "$REPO_ROOT/frontend" --no-logs

echo "==> 6/6 Point the web app at the real frontend image + fix CORS"
WEB_URL="$(az deployment group show -g "$RESOURCE_GROUP" -n main --query properties.outputs.webUrl.value -o tsv)"
az containerapp update -g "$RESOURCE_GROUP" -n "${NAME_PREFIX}-web" --image "$FRONTEND_IMAGE"
az containerapp update -g "$RESOURCE_GROUP" -n "${NAME_PREFIX}-api" \
  --set-env-vars CORS_ORIGINS="$WEB_URL"

echo "Done.  web: $WEB_URL   api: $API_URL   mcp: $MCP_URL"
