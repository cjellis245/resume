param appName string = 'cjellis-resume'
param location string = 'eastus2' // Optimized for Free Tier feature availability

// 1. The Azure Static Web App Ecosystem
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: appName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  identity: {
    type: 'SystemAssigned' // Generates the passwordless cloud identity card
  }
  properties: {}
}

// 2. Azure OpenAI Account
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: '${appName}-openai'
  location: 'eastus' // Best region for model capacity availability
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'Enabled' }
}

// 3. The gpt-4o-mini Deployment Instance
resource aiModel 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'resume-chat-model'
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o-mini'
      version: '2024-07-18'
    }
  }
  sku: { name: 'Standard', capacity: 10 }
}

// 4. Azure AI Search (Our Vector Database Container)
resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: '${appName}-search'
  location: 'eastus'
  sku: { name: 'free' } // 100% Free Lifetime Tier
  properties: {
    replicaCount: 1
    partitionCount: 1
    publicNetworkAccess: 'Enabled'
  }
}

// 5. Assign Permissions: Grant SWA backend access to read OpenAI
resource openAiRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticWebApp.id, 'openai-access')
  scope: openAiAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0c59e6-11eb-4bbd-851d-7d4b149cdd15') // Cognitive Services OpenAI User
    principalId: staticWebApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// 6. Assign Permissions: Grant SWA backend access to read Search Index
resource searchRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticWebApp.id, 'search-access')
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '1407120e-8ad2-4313-a028-12c843c144c3') // Search Index Data Reader
    principalId: staticWebApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// 7. Push Environment Configurations straight into SWA App Settings
resource swaConfig 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    OPENAI_ENDPOINT: openAiAccount.properties.endpoint
    OPENAI_CHAT_DEPLOYMENT: 'resume-chat-model'
    SEARCH_ENDPOINT: 'https://${searchService.name}.search.windows.net'
    SEARCH_INDEX: 'resume'
  }
}
