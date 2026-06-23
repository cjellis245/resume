param appName string = 'ResumeWEB'
param location string = 'centralus' // Matches your existing Static Web App location

// 1. Provisions your Static Web App on the Free Tier
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: appName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// 2. Provisions your Azure OpenAI Service (Given a fresh name to bypass the Azure lock)
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: 'cjellis-res-openai' // 👈 Changed name to break the provisioning freeze
  location: 'swedencentral' 
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { publicNetworkAccess: 'enabled' }
}

// 3. Deploys the gpt-4.1-mini model
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

// 4. References your EXISTING Search Database 
resource searchService 'Microsoft.Search/searchServices@2023-11-01' existing = {
  name: 'cjellis-resume-search'
}

// 5. Configures environment variables straight inside your Static Web App automatically
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
