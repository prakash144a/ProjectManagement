// Azure Container Apps deployment for the AI-native task manager.
//
// Three SEPARATE apps from two images, in one Container Apps environment:
//   - api  : FastAPI REST + agent + voice   (backend image, default command)
//   - mcp  : standalone MCP server           (backend image, command override)
//   - web  : Next.js frontend                (frontend image)
//
// Postgres is NOT provisioned here — you already run Azure Postgres; its
// connection string (and the other app secrets) live in Key Vault, created once by
// infra/oneTimeScripts/kvSecrets_Prod.sh and read via a user-assigned identity. Deploy at
// resource-group scope:  az deployment group create -g <rg> -f main.bicep ...

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short prefix for resource names, e.g. "pmapp".')
param namePrefix string = 'pmapp'

// --- Container registry (holds the built images) ---
@description('Login server of your registry, e.g. myacr.azurecr.io')
param registryServer string
@description('Registry username (or use managed identity — see DEPLOY.md).')
param registryUsername string
@secure()
@description('Registry password / token.')
param registryPassword string

@description('Full backend image reference (used by api AND mcp).')
param backendImage string // e.g. myacr.azurecr.io/pm-backend:latest
@description('Full frontend image reference. Defaults to a placeholder so the first deploy can come up; build + set the real image once the api/mcp URLs exist (see DEPLOY.md).')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// --- Secrets: sourced from Key Vault (created once by infra/oneTimeScripts/kvSecrets_Prod.sh) ---
@description('Name of the Key Vault holding database-url, gemini-api-key, acs-email-connection-string.')
param keyVaultName string
@description('Resource id of the user-assigned managed identity that can read the vault secrets (printed by kvSecrets_Prod.sh).')
param userAssignedIdentityId string

// --- Non-secret config ---
@description('Gemini text model.')
param geminiModel string = 'gemini-flash-latest'
@description('Gemini Live (voice) model.')
param geminiLiveModel string = 'gemini-2.5-flash-native-audio-latest'
@description('Comma-separated allowed CORS origins (the web app URL).')
param corsOrigins string
@description('Verified ACS sender address, e.g. DoNotReply@<domain>.azurecomm.net. Not secret.')
param acsEmailSender string
@description('Product name shown in OTP emails.')
param appName string = 'Project Management'

var envName = '${namePrefix}-env'
// Base URI for Key Vault secret references (no version → always resolves latest).
var kvSecretUri = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/'

// --- Observability + environment ---
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// --- api: REST + agent + voice (public) ---
resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  identity: {
    // User-assigned identity (from kvSecrets_Prod.sh) used to read Key Vault secrets.
    type: 'UserAssigned'
    userAssignedIdentities: { '${userAssignedIdentityId}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 8000, transport: 'auto' } // WebSockets (voice) OK
      registries: [ { server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' } ]
      secrets: [
        { name: 'registry-password', value: registryPassword }
        // Resolved from Key Vault at runtime via the user-assigned identity above.
        { name: 'database-url', keyVaultUrl: '${kvSecretUri}database-url', identity: userAssignedIdentityId }
        { name: 'gemini-api-key', keyVaultUrl: '${kvSecretUri}gemini-api-key', identity: userAssignedIdentityId }
        { name: 'acs-email-connection-string', keyVaultUrl: '${kvSecretUri}acs-email-connection-string', identity: userAssignedIdentityId }
      ]
    }
    template: {
      containers: [ {
        name: 'api'
        image: backendImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'ENV', value: 'prod' }
          { name: 'DEV_OTP_ECHO', value: 'false' } // never echo OTP codes in prod
          { name: 'CORS_ORIGINS', value: corsOrigins }
          { name: 'GEMINI_MODEL', value: geminiModel }
          { name: 'GEMINI_LIVE_MODEL', value: geminiLiveModel }
          { name: 'APP_NAME', value: appName }
          { name: 'ACS_EMAIL_SENDER', value: acsEmailSender } // sender is not secret
          { name: 'DATABASE_URL', secretRef: 'database-url' }
          { name: 'GEMINI_API_KEY', secretRef: 'gemini-api-key' }
          { name: 'ACS_EMAIL_CONNECTION_STRING', secretRef: 'acs-email-connection-string' }
        ]
      } ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// --- mcp: standalone MCP server (public). Proxies to api; holds no secrets. ---
resource mcp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-mcp'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 8100, transport: 'auto' }
      registries: [ { server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' } ]
      secrets: [ { name: 'registry-password', value: registryPassword } ]
    }
    template: {
      containers: [ {
        name: 'mcp'
        image: backendImage
        command: [ 'uvicorn', 'mcp_server.server:app', '--host', '0.0.0.0', '--port', '8100' ]
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: [
          { name: 'MCP_REST_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
        ]
      } ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// --- web: Next.js frontend (public). API/MCP URLs are baked at image build. ---
resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-web'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto' }
      registries: [ { server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' } ]
      secrets: [ { name: 'registry-password', value: registryPassword } ]
    }
    template: {
      containers: [ {
        name: 'web'
        image: frontendImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
      } ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output mcpUrl string = 'https://${mcp.properties.configuration.ingress.fqdn}/mcp'
output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
