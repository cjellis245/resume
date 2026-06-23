param appName string = 'ResumeWEB'
param location string = 'centralus' // Matches your existing Static Web App location

// 1. Provisions your Static Web App on the Free Tier (No Managed Identity allowed on Free)
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: appName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// 2. Provisions your Azure OpenAI Service (Moved to Sweden Central for open developer quota)
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: 'cjellis-resume-openai'
  location: 'swedencentral' 
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'enabled' }
}

// 3. Deploys the gpt-4.1-mini model (Capacity dropped to 1 to clear regional limits)
resource aiModel 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'resume-chat-model'
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: '2025-04-14'
    }
  }
  sku: { name: 'GlobalStandard', capacity: 1 }
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

// 5. Configures environment variables straight inside your existing ResumeWEB app automatically
// We securely pull the deployment keys directly to authenticate without needing a SWA Identity card.
resource swaConfig 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    OPENAI_ENDPOINT: openAiAccount.properties.endpoint
    OPENAI_CHAT_DEPLOYMENT: 'resume-chat-model'
    OPENAI_API_KEY: openAiAccount.listKeys().key1
    SEARCH_ENDPOINT: 'https://${searchService.name}.search.windows.net'
    SEARCH_INDEX: 'resume'
    SEARCH_API_KEY: searchService.listKeys().primaryKey
  }
}
