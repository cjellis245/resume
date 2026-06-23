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

// 2. Provisions your Azure OpenAI Service
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: 'cjellis-res-openai' 
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
