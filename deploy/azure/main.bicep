// ElectraGuard AI on Azure Container Apps (plan section 9).
//
// stage 'infra': network, logs, registry, Key Vault, private media share, PostgreSQL.
// stage 'jobs':  infra + the db-init and migrate jobs (needs images in the registry).
// stage 'apps':  jobs + gateway, frontend, backend, media worker (and optional triage worker).
//
// deploy.sh runs the stages in order. Everything sits in one virtual network: PostgreSQL has
// no public endpoint, the media share accepts only the apps subnet, and only the gateway has
// public ingress. Secrets live in Key Vault and are mounted as files under /run/secrets, the
// same layout the Compose deployment uses, so the images run unchanged.

targetScope = 'resourceGroup'

@description('Deployment stage: infra, jobs or apps.')
@allowed(['infra', 'jobs', 'apps'])
param stage string = 'infra'

@description('Short name of lower-case letters and digits used in every resource name, e.g. electraguard.')
@minLength(3)
@maxLength(12)
param prefix string = 'electraguard'

param location string = resourceGroup().location

@description('Public host name people use, e.g. electraguard.example.org. Must match the custom domain bound to the gateway, or the gateway default host name.')
param host string

@description('Image tag built by deploy.sh images, e.g. a commit hash.')
param release string = ''

@description('Object id of the person or workload identity that runs deploy.sh; it is allowed to write the generated secrets.')
param deployerObjectId string

@description('PrincipalType of deployerObjectId.')
@allowed(['User', 'ServicePrincipal'])
param deployerPrincipalType string = 'User'

@secure()
@description('PostgreSQL administrator password (stored in Key Vault as postgres-bootstrap by deploy.sh).')
param postgresAdminPassword string

param postgresSku string = 'Standard_B1ms'
param postgresTier string = 'Burstable'
param postgresStorageGb int = 32
param postgresBackupDays int = 7
param mediaShareQuotaGb int = 100
param observationIntakeEnabled bool = false
param deployTriageWorker bool = false

@description('app: an always-on media worker (fastest). scheduled: a job started every minute, billed only while it runs.')
@allowed(['app', 'scheduled'])
param mediaWorkerMode string = 'app'

@description('vCPU for the media worker. A 60 s 720p video took about 70 to 90 s on 4 cores in testing.')
@allowed(['1.0', '2.0', '4.0'])
param mediaWorkerCpu string = '2.0'

var name = toLower(prefix)
var unique = uniqueString(resourceGroup().id, name)
var vnetCidr = '10.40.0.0/16'
var appsSubnetCidr = '10.40.0.0/23'
var databaseSubnetCidr = '10.40.2.0/24'
var mediaMount = '/var/lib/electraguard/media'
var withJobs = stage != 'infra'
var withApps = stage == 'apps'

// Built-in role definition ids.
var acrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var keyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var keyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

// ---------------------------------------------------------------- network and logs

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: '${name}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: [vnetCidr] }
    subnets: [
      {
        name: 'apps'
        properties: {
          addressPrefix: appsSubnetCidr
          delegations: [{ name: 'apps', properties: { serviceName: 'Microsoft.App/environments' } }]
          serviceEndpoints: [{ service: 'Microsoft.Storage' }]
        }
      }
      {
        name: 'database'
        properties: {
          addressPrefix: databaseSubnetCidr
          delegations: [{ name: 'database', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${name}-${unique}.private.postgres.database.azure.com'
  location: 'global'
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresDns
  name: 'vnet'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// ---------------------------------------------------------------- identity, registry, secrets

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-apps'
  location: location
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${name}${unique}'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPull)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPull)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

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
  }
}

resource vaultRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUser)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource vaultWrite 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, deployerObjectId, keyVaultSecretsOfficer)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficer)
    principalId: deployerObjectId
    principalType: deployerPrincipalType
  }
}

// ---------------------------------------------------------------- private media share

resource media 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'egmedia${unique}'
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_ZRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    // Container Apps mounts Azure Files over SMB with the account key.
    allowSharedKeyAccess: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'None'
      virtualNetworkRules: [{ id: vnet.properties.subnets[0].id, action: 'Allow' }]
    }
  }
}

resource mediaFiles 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: media
  name: 'default'
  properties: {
    shareDeleteRetentionPolicy: { enabled: true, days: 14 }
  }
}

resource mediaShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: mediaFiles
  name: 'private-media'
  properties: {
    shareQuota: mediaShareQuotaGb
    enabledProtocols: 'SMB'
  }
}

// ---------------------------------------------------------------- PostgreSQL

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${name}-db-${take(unique, 6)}'
  location: location
  sku: { name: postgresSku, tier: postgresTier }
  properties: {
    version: '17'
    administratorLogin: 'electraguard_bootstrap'
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: postgresStorageGb, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: postgresBackupDays, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: vnet.properties.subnets[1].id
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }
  dependsOn: [postgresDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'electraguard'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// ---------------------------------------------------------------- Container Apps environment

resource appsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: vnet.properties.subnets[0].id
      internal: false
    }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource environmentMedia 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: appsEnvironment
  name: 'private-media'
  properties: {
    azureFile: {
      accountName: media.name
      accountKey: media.listKeys().keys[0].value
      shareName: mediaShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ---------------------------------------------------------------- shared container settings

var registryServer = registry.properties.loginServer
var registries = [{ server: registryServer, identity: identity.id }]
var vaultUrl = 'https://${vault.name}${environment().suffixes.keyvaultDns}/secrets'
var djangoSecretRef = { name: 'django-secret', keyVaultUrl: '${vaultUrl}/django-secret', identity: identity.id }
var runtimeSecretRef = { name: 'database-runtime', keyVaultUrl: '${vaultUrl}/postgres-runtime', identity: identity.id }
var migratorSecretRef = { name: 'database-migrator', keyVaultUrl: '${vaultUrl}/postgres-migrator', identity: identity.id }
var bootstrapSecretRef = { name: 'database-bootstrap', keyVaultUrl: '${vaultUrl}/postgres-bootstrap', identity: identity.id }
var djangoEnv = [
  { name: 'DJANGO_DEBUG', value: 'false' }
  { name: 'DJANGO_ALLOWED_HOSTS', value: host }
  { name: 'DJANGO_TRUST_PROXY_HTTPS', value: 'true' }
  { name: 'FRONTEND_ORIGIN', value: 'https://${host}' }
  { name: 'OBSERVATION_INTAKE_ENABLED', value: observationIntakeEnabled ? 'true' : 'false' }
  { name: 'POSTGRES_DB', value: 'electraguard' }
  { name: 'POSTGRES_HOST', value: postgres.properties.fullyQualifiedDomainName }
  { name: 'POSTGRES_PORT', value: '5432' }
  { name: 'PGSSLMODE', value: 'require' }
  { name: 'PRIVATE_MEDIA_ROOT', value: mediaMount }
]
var runtimeEnv = concat(djangoEnv, [{ name: 'POSTGRES_USER', value: 'electraguard_runtime' }])
var runtimeSecrets = [djangoSecretRef, runtimeSecretRef]
var runtimeSecretFiles = {
  name: 'secrets'
  storageType: 'Secret'
  secrets: [
    { secretRef: 'django-secret', path: 'django_secret' }
    { secretRef: 'database-runtime', path: 'database_password' }
  ]
}
// SMB mounts take ownership from mount options; the backend image runs as 10001.
var mediaVolume = {
  name: 'media'
  storageType: 'AzureFile'
  storageName: environmentMedia.name
  mountOptions: 'uid=10001,gid=10001,dir_mode=0700,file_mode=0600,nobrl'
}
var djangoMounts = [
  { volumeName: 'secrets', mountPath: '/run/secrets' }
  { volumeName: 'media', mountPath: mediaMount }
]
var entrypoint = '/usr/local/bin/electraguard-django'
var backendImage = '${registryServer}/electraguard-backend:${release}'

// ---------------------------------------------------------------- jobs

resource dbInit 'Microsoft.App/jobs@2024-03-01' = if (withJobs) {
  name: '${name}-db-init'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: [bootstrapSecretRef, migratorSecretRef, runtimeSecretRef]
    }
    template: {
      containers: [{
        name: 'db-init'
        image: '${registryServer}/electraguard-db-init:${release}'
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: [
          { name: 'PGHOST', value: postgres.properties.fullyQualifiedDomainName }
          { name: 'PGUSER', value: 'electraguard_bootstrap' }
          { name: 'PGDATABASE', value: 'electraguard' }
          { name: 'PGSSLMODE', value: 'require' }
        ]
        volumeMounts: [{ volumeName: 'secrets', mountPath: '/run/secrets' }]
      }]
      volumes: [{
        name: 'secrets'
        storageType: 'Secret'
        secrets: [
          { secretRef: 'database-bootstrap', path: 'database_bootstrap' }
          { secretRef: 'database-migrator', path: 'database_migrator' }
          { secretRef: 'database-runtime', path: 'database_runtime' }
        ]
      }]
    }
  }
  dependsOn: [registryPull, vaultRead, database]
}

resource migrate 'Microsoft.App/jobs@2024-03-01' = if (withJobs) {
  name: '${name}-migrate'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: [djangoSecretRef, migratorSecretRef]
    }
    template: {
      containers: [{
        name: 'migrate'
        image: backendImage
        command: [entrypoint, 'python', 'manage.py', 'migrate', '--noinput']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(djangoEnv, [{ name: 'POSTGRES_USER', value: 'electraguard_migrator' }])
        volumeMounts: [{ volumeName: 'secrets', mountPath: '/run/secrets' }]
      }]
      volumes: [{
        name: 'secrets'
        storageType: 'Secret'
        secrets: [
          { secretRef: 'django-secret', path: 'django_secret' }
          { secretRef: 'database-migrator', path: 'database_password' }
        ]
      }]
    }
  }
  dependsOn: [registryPull, vaultRead, database]
}

// ---------------------------------------------------------------- apps

resource backend 'Microsoft.App/containerApps@2024-03-01' = if (withApps) {
  name: 'backend'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      // TCP keeps the gateway's Host header intact; HTTP ingress would route on it.
      ingress: { external: false, transport: 'tcp', targetPort: 8000, exposedPort: 8000 }
      registries: registries
      secrets: runtimeSecrets
    }
    template: {
      containers: [{
        name: 'backend'
        image: backendImage
        command: [
          entrypoint, '/bin/sh', '-ec'
          'python manage.py migrate --check && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 60 --worker-tmp-dir /dev/shm'
        ]
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: runtimeEnv
        volumeMounts: djangoMounts
        probes: [{
          type: 'Readiness'
          httpGet: {
            path: '/health/ready'
            port: 8000
            httpHeaders: [{ name: 'Host', value: host }, { name: 'X-Forwarded-Proto', value: 'https' }]
          }
          periodSeconds: 10
          timeoutSeconds: 5
        }]
      }]
      volumes: [runtimeSecretFiles, mediaVolume]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [registryPull, vaultRead]
}

var mediaWorkerMemory = { '1.0': '2Gi', '2.0': '4Gi', '4.0': '8Gi' }[mediaWorkerCpu]

resource mediaWorker 'Microsoft.App/containerApps@2024-03-01' = if (withApps && mediaWorkerMode == 'app') {
  name: 'media-worker'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registries
      secrets: runtimeSecrets
    }
    template: {
      containers: [{
        name: 'media-worker'
        image: backendImage
        command: [entrypoint, '/bin/sh', '-ec', 'python manage.py migrate --check && exec python manage.py run_media']
        resources: { cpu: json(mediaWorkerCpu), memory: mediaWorkerMemory }
        env: runtimeEnv
        volumeMounts: djangoMounts
      }]
      volumes: [runtimeSecretFiles, mediaVolume]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [registryPull, vaultRead]
}

// Claims use row locks with SKIP LOCKED, so overlapping runs process different items.
resource mediaJob 'Microsoft.App/jobs@2024-03-01' = if (withApps && mediaWorkerMode == 'scheduled') {
  name: '${name}-media'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      scheduleTriggerConfig: { cronExpression: '*/1 * * * *', parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: runtimeSecrets
    }
    template: {
      containers: [{
        name: 'media'
        image: backendImage
        command: [entrypoint, 'python', 'manage.py', 'run_media', '--once']
        resources: { cpu: json(mediaWorkerCpu), memory: mediaWorkerMemory }
        env: runtimeEnv
        volumeMounts: djangoMounts
      }]
      volumes: [runtimeSecretFiles, mediaVolume]
    }
  }
  dependsOn: [registryPull, vaultRead]
}

resource triageWorker 'Microsoft.App/containerApps@2024-03-01' = if (withApps && deployTriageWorker) {
  name: 'triage-worker'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registries
      secrets: runtimeSecrets
    }
    template: {
      containers: [{
        name: 'triage-worker'
        image: backendImage
        command: [entrypoint, '/bin/sh', '-ec', 'python manage.py migrate --check && exec python manage.py run_triage']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: runtimeEnv
        volumeMounts: djangoMounts
      }]
      volumes: [runtimeSecretFiles, mediaVolume]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [registryPull, vaultRead]
}

resource frontend 'Microsoft.App/containerApps@2024-03-01' = if (withApps) {
  name: 'frontend'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: false, transport: 'tcp', targetPort: 3000, exposedPort: 3000 }
      registries: registries
    }
    template: {
      containers: [{
        name: 'frontend'
        image: '${registryServer}/electraguard-frontend:${release}'
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [registryPull]
}

resource gateway 'Microsoft.App/containerApps@2024-03-01' = if (withApps) {
  name: 'gateway'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: appsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        transport: 'http'
        targetPort: 8080
        allowInsecure: false
        // The frontend's server side reads the API through gateway:8081 (see frontend.Dockerfile).
        additionalPortMappings: [{ external: false, targetPort: 8081, exposedPort: 8081 }]
      }
      registries: registries
    }
    template: {
      containers: [{
        name: 'gateway'
        image: '${registryServer}/electraguard-gateway:${release}'
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: [
          { name: 'ELECTRAGUARD_HOST', value: host }
          { name: 'ELECTRAGUARD_TRUSTED_PROXY_CIDR', value: appsSubnetCidr }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [registryPull, backend, frontend]
}

output registryName string = registry.name
output registryServer string = registryServer
output vaultName string = vault.name
output environmentName string = appsEnvironment.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output dbInitJob string = withJobs ? dbInit.name : ''
output migrateJob string = withJobs ? migrate.name : ''
output gatewayDefaultHost string = withApps ? gateway.properties.configuration.ingress.fqdn : ''
