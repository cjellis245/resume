param appName string = 'ResumeWEB'
param location string = 'centralus' // Matches your existing Static Web App location

// 1. References your existing Static Web App and ensures Managed Identity card is active
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: appName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
 // identity: {
//    type: 'SystemAssigned' 
//  }
  properties: {}
}

// 2. Provisions your Azure OpenAI Service
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: 'cjellis-resume-openai'
  location: 'eastus' // Region with optimal availability for gpt-4o-mini instances
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'enabled' }
}

// 3. Deploys the fast, cheap gpt-4o-mini brain
resource aiModel 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'resume-chat-model'
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-5.4-mini'
      version: '2026-03-17'
    }
  }
  sku: { name: 'GlobalStandard', capacity: 10 }
}

// 4. Provisions your Vector Search Database
resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: 'cjellis-resume-search'
  location: 'eastus'
  sku: { name: 'free' } // 100% Lifetime Free Tier
  properties: {
    replicaCount: 1
    partitionCount: 1
    publicNetworkAccess: 'enabled'
  }
}

// 5. Connects permissions: Grants ResumeWEB secure clearance to access OpenAI
resource openAiRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticWebApp.id, 'openai-access')
  scope: openAiAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0c59e6-11eb-4bbd-851d-7d4b149cdd15') // Cognitive Services OpenAI User
    principalId: staticWebApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// 6. Connects permissions: Grants ResumeWEB secure clearance to read your Search Index
resource searchRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticWebApp.id, 'search-access')
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '1407120e-8ad2-4313-a028-12c843c144c3') // Search Index Data Reader
    principalId: staticWebApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// 7. Configures environment variables straight inside your existing ResumeWEB app automatically
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
