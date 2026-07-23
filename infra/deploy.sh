#!/usr/bin/env bash
# Deploy the app (api + mcp) and web to Azure Container Apps.
#
# Prereqs: az CLI logged in (`az login`), the containerapp extension
# (`az extension add -n containerapp`), and an Azure Container Registry.
#
# Fill in the CHANGEME placeholders (or export them as env vars) before running.
#
# App secrets live in Key Vault — run the environment's one-time bootstrap ONCE first
# (prod: `infra/oneTimeScripts/kvSecrets_Prod.sh`), then export the KEY_VAULT_NAME +
# USER_ASSIGNED_IDENTITY_ID it prints. No secret VALUES are passed here (only the ACR
# password, fetched below at deploy time).
set -euo pipefail

# ---- FILL THESE IN (or export before running) -------------------------------
SUBSCRIPTION="${SUBSCRIPTION:-CHANGEME-subscription-id}"
RESOURCE_GROUP="${RESOURCE_GROUP:-CHANGEME-resource-group}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-CHANGEME}"            # registry name (without .azurecr.io)
NAME_PREFIX="${NAME_PREFIX:-pmapp}"

# Key Vault references (from kvSecrets_Prod.sh) + non-secret ACS sender:
KEY_VAULT_NAME="${KEY_VAULT_NAME:?run infra/oneTimeScripts/kvSecrets_Prod.sh first, then export KEY_VAULT_NAME}"
USER_ASSIGNED_IDENTITY_ID="${USER_ASSIGNED_IDENTITY_ID:?export USER_ASSIGNED_IDENTITY_ID (printed by kvSecrets_Prod.sh)}"
ACS_EMAIL_SENDER="${ACS_EMAIL_SENDER:?export ACS_EMAIL_SENDER=DoNotReply@<your-verified-domain>}"
# -----------------------------------------------------------------------------

REGISTRY="${ACR_NAME}.azurecr.io"
BACKEND_IMAGE="${REGISTRY}/pm-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/pm-frontend:latest"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

az account set --subscription "$SUBSCRIPTION"
ACR_PASSWORD="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
ACR_USER="$(az acr credential show -n "$ACR_NAME" --query 'username' -o tsv)"

echo "==> 1/5 Build backend image in ACR"
az acr build -r "$ACR_NAME" -t "pm-backend:latest" "$REPO_ROOT/backend"

echo "==> 2/5 Deploy api + mcp (frontend uses a placeholder image for now)"
az deployment group create \
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

echo "==> 3/5 Run DB migrations (once VECTOR is allow-listed in azure.extensions)"
echo "    az containerapp exec -g $RESOURCE_GROUP -n ${NAME_PREFIX}-api --command 'alembic upgrade head'"

echo "==> 4/5 Build frontend image with the real API/MCP URLs baked in"
az acr build -r "$ACR_NAME" -t "pm-frontend:latest" \
  --build-arg NEXT_PUBLIC_API_BASE="$API_URL" \
  --build-arg NEXT_PUBLIC_MCP_URL="$MCP_URL" \
  "$REPO_ROOT/frontend"

echo "==> 5/5 Point the web app at the real frontend image + fix CORS"
WEB_URL="$(az deployment group show -g "$RESOURCE_GROUP" -n main --query properties.outputs.webUrl.value -o tsv)"
az containerapp update -g "$RESOURCE_GROUP" -n "${NAME_PREFIX}-web" --image "$FRONTEND_IMAGE"
az containerapp update -g "$RESOURCE_GROUP" -n "${NAME_PREFIX}-api" \
  --set-env-vars CORS_ORIGINS="$WEB_URL"

echo "Done.  web: $WEB_URL   api: $API_URL   mcp: $MCP_URL"
