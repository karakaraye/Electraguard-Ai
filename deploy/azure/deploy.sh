#!/usr/bin/env bash
# Deploy ElectraGuard AI to Azure Container Apps. See docs/azure-deployment.md.
#
#   deploy/azure/deploy.sh infra            network, PostgreSQL, Key Vault, registry, media share
#   deploy/azure/deploy.sh images [RELEASE] build images in Azure Container Registry
#   deploy/azure/deploy.sh apps [RELEASE]   database roles, migrations, then the apps
#   deploy/azure/deploy.sh all [RELEASE]    all three, in order
#
# Needs the Azure CLI, signed in (az login, or azure/login in GitHub Actions), and:
#   AZURE_RESOURCE_GROUP   resource group to create or reuse
#   AZURE_LOCATION         Azure region, e.g. southafricanorth
#   ELECTRAGUARD_HOST      public host name, e.g. electraguard.example.org
# Optional: ELECTRAGUARD_PREFIX (default electraguard), OBSERVATION_INTAKE_ENABLED
# (default false), DEPLOY_TRIAGE_WORKER (default false), ELECTRAGUARD_DEPLOYER_OBJECT_ID
# (the deploying service principal's object id, when it cannot read the directory),
# MEDIA_WORKER_MODE (app or scheduled, default app), MEDIA_WORKER_CPU (1.0, 2.0 or 4.0).
# RELEASE defaults to the current commit. Images are built from the committed tree only.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP}"
: "${AZURE_LOCATION:?Set AZURE_LOCATION}"
: "${ELECTRAGUARD_HOST:?Set ELECTRAGUARD_HOST}"
prefix=${ELECTRAGUARD_PREFIX:-electraguard}
intake=${OBSERVATION_INTAKE_ENABLED:-false}
triage=${DEPLOY_TRIAGE_WORKER:-false}
media_mode=${MEDIA_WORKER_MODE:-app}
media_cpu=${MEDIA_WORKER_CPU:-2.0}
rg=$AZURE_RESOURCE_GROUP
# A generated administrator password waits here until Key Vault holds it.
state="${XDG_STATE_HOME:-$HOME/.local/state}/electraguard-azure/$rg"

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

secret_get() {
  az keyvault secret show --vault-name "$1" -n "$2" --query value -o tsv 2>/dev/null || true
}

# Writes a secret if it does not exist yet. Role assignments take a few minutes to apply.
secret_ensure() {
  local vault=$1 name=$2 value=$3 attempt
  for attempt in $(seq 1 20); do
    if az keyvault secret show --vault-name "$vault" -n "$name" --query id -o tsv >/dev/null 2>&1; then
      return 0
    fi
    if az keyvault secret set --vault-name "$vault" -n "$name" --value "$value" --only-show-errors >/dev/null 2>&1; then
      return 0
    fi
    echo "Waiting for Key Vault access ($attempt/20)..." >&2
    sleep 15
  done
  echo "Could not write $name to Key Vault $vault." >&2
  return 1
}

admin_password() {
  local vault password
  vault=$(output infra vaultName)
  password=""
  [ -n "$vault" ] && password=$(secret_get "$vault" postgres-bootstrap)
  if [ -z "$password" ] && [ -f "$state/postgres-bootstrap" ]; then
    password=$(cat "$state/postgres-bootstrap")
  fi
  if [ -z "$password" ]; then
    mkdir -p "$state" && chmod 700 "$state"
    (umask 077 && openssl rand -hex 32 > "$state/postgres-bootstrap")
    password=$(cat "$state/postgres-bootstrap")
  fi
  printf '%s' "$password"
}

deploy_stage() {
  local stage=$1 release=$2 password=$3 who object type secrets
  who=$(deployer); object=${who% *}; type=${who#* }
  # The password goes in a private file, not on the command line where other processes can see it.
  secrets=$(mktemp)
  chmod 600 "$secrets"
  printf '{"parameters": {"postgresAdminPassword": {"value": "%s"}}}' "$password" > "$secrets"
  log "Deploying stage $stage"
  az deployment group create -g "$rg" -n "electraguard-$stage" --only-show-errors -o none \
    --template-file "$here/main.bicep" \
    --parameters stage="$stage" prefix="$prefix" location="$AZURE_LOCATION" host="$ELECTRAGUARD_HOST" \
      release="$release" deployerObjectId="$object" deployerPrincipalType="$type" \
      observationIntakeEnabled="$intake" deployTriageWorker="$triage" \
      mediaWorkerMode="$media_mode" mediaWorkerCpu="$media_cpu" \
    --parameters "@$secrets" || { rm -f "$secrets"; return 1; }
  rm -f "$secrets"
}

infra() {
  local password vault
  log "Resource group $rg in $AZURE_LOCATION"
  az group create -n "$rg" -l "$AZURE_LOCATION" --only-show-errors -o none
  password=$(admin_password)
  deploy_stage infra "${1:-}" "$password"
  vault=$(output infra vaultName)
  log "Storing secrets in Key Vault $vault"
  secret_ensure "$vault" postgres-bootstrap "$password"
  secret_ensure "$vault" postgres-migrator "$(openssl rand -hex 32)"
  secret_ensure "$vault" postgres-runtime "$(openssl rand -hex 32)"
  secret_ensure "$vault" django-secret "$(openssl rand -hex 48)"
  rm -f "$state/postgres-bootstrap"
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
  local release password vault
  release=$(release_tag "${1:-}")
  vault=$(output infra vaultName)
  [ -n "$vault" ] || { echo "Run '$0 infra' first." >&2; exit 1; }
  password=$(secret_get "$vault" postgres-bootstrap)
  deploy_stage jobs "$release" "$password"
  run_job "$(output jobs dbInitJob)" db-init
  run_job "$(output jobs migrateJob)" migrate
  deploy_stage apps "$release" "$password"
  log "Deployed $release. Gateway: https://$(output apps gatewayDefaultHost) (bind $ELECTRAGUARD_HOST to it; see the runbook)."
}

case "${1:-}" in
  infra) infra ;;
  images) images "${2:-}" ;;
  apps) apps "${2:-}" ;;
  all) infra; images "${2:-}"; apps "${2:-}" ;;
  *) sed -n '2,19p' "$0"; exit 2 ;;
esac
