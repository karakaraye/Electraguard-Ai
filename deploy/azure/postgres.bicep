// PostgreSQL 17 Flexible Server in the private database subnet. The administrator password
// arrives as a Key Vault reference from main.bicep.

param name string
param location string
param subnetId string
param privateDnsZoneId string
param sku string
param tier string
param storageGb int
param backupDays int

@secure()
param administratorPassword string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  sku: { name: sku, tier: tier }
  properties: {
    version: '17'
    administratorLogin: 'electraguard_bootstrap'
    administratorLoginPassword: administratorPassword
    storage: { storageSizeGB: storageGb, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: backupDays, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: subnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'electraguard'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
