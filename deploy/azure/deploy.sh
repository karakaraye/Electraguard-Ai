#!/usr/bin/env bash
# Deploy ElectraGuard AI to Azure Container Apps. See docs/azure-deployment.md.
#
#   deploy/azure/deploy.sh infra            Key Vault and secrets, then network, PostgreSQL, registry, media share
#   deploy/azure/deploy.sh images [RELEASE] build images in Azure Container Registry
#   deploy/azure/deploy.sh apps [RELEASE]   database roles, migrations, then the apps
#   deploy/azure/deploy.sh all [RELEASE]    all three, in order
#
# Needs the Azure CLI, signed in (az login, or azure/login in GitHub Actions), and:
#   AZURE_RESOURCE_GROUP   resource group to create or reuse
#   ELECTRAGUARD_HOST      public host name, e.g. electraguard.example.org
# Optional: AZURE_LOCATION (default southafricanorth, the closest region to Nigeria),
# ELECTRAGUARD_PREFIX (default electraguard), OBSERVATION_INTAKE_ENABLED (default false),
# DEPLOY_TRIAGE_WORKER (default false), ELECTRAGUARD_DEPLOYER_OBJECT_ID (the deploying
# service principal's object id, when it cannot read the directory), MEDIA_WORKER_MODE
# (app or scheduled, default app), MEDIA_WORKER_CPU (1.0, 2.0 or 4.0), MEDIA_WORKER_REPLICAS.
# RELEASE defaults to the current commit. Images are built from the committed tree only.
#
# Secrets are generated straight into Key Vault and never written to disk or passed on a
# command line. The deployer can write them only while `infra` runs.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"
: "${ELECTRAGUARD_HOST:?Set ELECTRAGUARD_HOST}"
location=${AZURE_LOCATION:-southafricanorth}
prefix=${ELECTRAGUARD_PREFIX:-electraguard}
intake=${OBSERVATION_INTAKE_ENABLED:-false}
triage=${DEPLOY_TRIAGE_WORKER:-false}
media_mode=${MEDIA_WORKER_MODE:-app}
media_cpu=${MEDIA_WORKER_CPU:-2.0}
media_replicas=${MEDIA_WORKER_REPLICAS:-1}
rg=$AZURE_RESOURCE_GROUP
secrets_officer=b86a8fe4-44ce-4948-aee5-eccb2c155cd7

az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null

log() { printf '\n== %s\n' "$*" >&2; }

release_tag() {
  local tag=${1:-}
  if [ -z "$tag" ]; then
    tag=$(git -C "$repo" rev-parse --short=12 HEAD)
    if [ -n "$(git -C "$repo" status --porcelain)" ]; then
      echo "Note: uncommitted changes are not included; images use commit $tag." >&2
    fi
  fi
  printf '%s' "$tag"
}

output() {
  az deployment group show -g "$rg" -n "electraguard-$1" --query "properties.outputs.$2.value" -o tsv 2>/dev/null || true
}

deployer() {
  local kind name
  # A workload identity may not be allowed to read the directory; it can pass its object id.
  if [ -n "${ELECTRAGUARD_DEPLOYER_OBJECT_ID:-}" ]; then
    printf '%s ServicePrincipal' "$ELECTRAGUARD_DEPLOYER_OBJECT_ID"
    return
  fi
  kind=$(az account show --query user.type -o tsv)
  name=$(az account show --query user.name -o tsv)
  if [ "$kind" = "servicePrincipal" ]; then
    printf '%s ServicePrincipal' "$(az ad sp show --id "$name" --query id -o tsv)"
  else
    printf '%s User' "$(az ad signed-in-user show --query id -o tsv)"
  fi
}

# Creates a random secret in Key Vault unless it already exists. The value goes from
# openssl to the Azure CLI through a pipe: no file, no command-line argument.
secret_ensure() {
  local vault=$1 name=$2 bytes=$3 attempt
  for attempt in $(seq 1 20); do
    if az keyvault secret show --vault-name "$vault" -n "$name" --query id -o tsv >/dev/null 2>&1; then
      return 0
    fi
    if openssl rand -hex "$bytes" | tr -d '\n' \
        | az keyvault secret set --vault-name "$vault" -n "$name" --file /dev/stdin --encoding utf-8 \
          --only-show-errors -o none 2>/dev/null; then
      return 0
    fi
    echo "Waiting for Key Vault access ($attempt/20)..." >&2
    sleep 15
  done
  echo "Could not write $name to Key Vault $vault." >&2
  return 1
}

revoke_write() {
  local vault_id=$1 object=$2
  az role assignment delete --assignee-object-id "$object" --role "$secrets_officer" --scope "$vault_id" \
    --only-show-errors -o none 2>/dev/null || echo "Could not remove Key Vault write access; remove it by hand." >&2
}

deploy_stage() {
  local stage=$1 release=$2 vault=$3
  log "Deploying stage $stage"
  az deployment group create -g "$rg" -n "electraguard-$stage" --only-show-errors -o none \
    --template-file "$here/main.bicep" \
    --parameters stage="$stage" prefix="$prefix" location="$location" host="$ELECTRAGUARD_HOST" \
      release="$release" vaultName="$vault" \
      observationIntakeEnabled="$intake" deployTriageWorker="$triage" \
      mediaWorkerMode="$media_mode" mediaWorkerCpu="$media_cpu" mediaWorkerReplicas="$media_replicas"
}

infra() {
  local who object type vault vault_id
  who=$(deployer); object=${who% *}; type=${who#* }
  log "Resource group $rg in $location"
  az group create -n "$rg" -l "$location" --only-show-errors -o none
  log "Key Vault (write access for this run only)"
  az deployment group create -g "$rg" -n electraguard-vault --only-show-errors -o none \
    --template-file "$here/vault.bicep" \
    --parameters prefix="$prefix" location="$location" deployerObjectId="$object" deployerPrincipalType="$type"
  vault=$(output vault vaultName)
  vault_id=$(output vault vaultId)
  # Remove the write access however this run ends, including on failure.
  revoke_target="$vault_id $object"
  trap 'revoke_write ${revoke_target}' EXIT
  secret_ensure "$vault" postgres-bootstrap 32
  secret_ensure "$vault" postgres-migrator 32
  secret_ensure "$vault" postgres-runtime 32
  secret_ensure "$vault" django-secret 48
  deploy_stage infra "" "$vault"
  revoke_write "$vault_id" "$object"
  trap - EXIT
}

images() {
  local release registry context
  release=$(release_tag "${1:-}")
  registry=$(output infra registryName)
  [ -n "$registry" ] || { echo "Run '$0 infra' first." >&2; exit 1; }
  context=$(mktemp -d)
  trap 'rm -rf "$context"; trap - RETURN' RETURN
  git -C "$repo" archive "$(git -C "$repo" rev-parse "$release" 2>/dev/null || git -C "$repo" rev-parse HEAD)" | tar -x -C "$context"
  for image in backend:deploy/backend.Dockerfile frontend:deploy/frontend.Dockerfile \
      gateway:deploy/azure/gateway.Dockerfile db-init:deploy/azure/db-init.Dockerfile; do
    log "Building electraguard-${image%%:*}:$release"
    az acr build -r "$registry" -t "electraguard-${image%%:*}:$release" -f "$context/${image#*:}" "$context" \
      --only-show-errors -o none
  done
}

run_job() {
  local job=$1 container=$2 execution status
  log "Running job $job"
  execution=$(az containerapp job start -g "$rg" -n "$job" --query name -o tsv)
  for _ in $(seq 1 120); do
    status=$(az containerapp job execution show -g "$rg" -n "$job" --job-execution-name "$execution" \
      --query properties.status -o tsv)
    case "$status" in
      Succeeded) echo "$job: succeeded" >&2; return 0 ;;
      Failed|Stopped|Degraded)
        echo "$job: $status. Logs: az containerapp job logs show -g $rg -n $job --execution $execution --container $container" >&2
        return 1 ;;
    esac
    sleep 10
  done
  echo "$job: still running after 20 minutes." >&2
  return 1
}

apps() {
  local release vault
  release=$(release_tag "${1:-}")
  vault=$(output vault vaultName)
  [ -n "$vault" ] || { echo "Run '$0 infra' first." >&2; exit 1; }
  deploy_stage jobs "$release" "$vault"
  run_job "$(output jobs dbInitJob)" db-init
  run_job "$(output jobs migrateJob)" migrate
  deploy_stage apps "$release" "$vault"
  log "Deployed $release. Gateway: https://$(output apps gatewayDefaultHost) (bind $ELECTRAGUARD_HOST to it; see the runbook)."
}

case "${1:-}" in
  infra) infra ;;
  images) images "${2:-}" ;;
  apps) apps "${2:-}" ;;
  all) infra; images "${2:-}"; apps "${2:-}" ;;
  *) sed -n '2,21p' "$0"; exit 2 ;;
esac
