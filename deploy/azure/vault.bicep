// Key Vault for ElectraGuard AI secrets, deployed before everything else so secrets can be
// generated straight into it. deploy.sh grants the person deploying write access only for
// the length of an `infra` run and removes it afterwards.

param prefix string = 'electraguard'
param location string = resourceGroup().location

@description('Object id of whoever runs deploy.sh infra. Empty grants nothing.')
param deployerObjectId string = ''

@allowed(['User', 'ServicePrincipal'])
param deployerPrincipalType string = 'User'

var name = toLower(prefix)
var unique = uniqueString(resourceGroup().id, name)
var keyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${name}-${take(unique, 8)}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    // Lets the PostgreSQL deployment read its administrator password with getSecret(),
    // so the password never passes through the deploy script.
    enabledForTemplateDeployment: true
  }
}

resource deployerWrite 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerObjectId)) {
  scope: vault
  name: guid(vault.id, deployerObjectId, keyVaultSecretsOfficer)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficer)
    principalId: deployerObjectId
    principalType: deployerPrincipalType
  }
}

output vaultName string = vault.name
output vaultId string = vault.id
