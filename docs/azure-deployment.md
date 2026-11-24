# Deploying ElectraGuard AI on Azure

These scripts put the same stack that runs under Docker Compose onto Azure Container Apps. They follow section 9 of the plan.

**Status:** the templates compile and lint clean, and the scripts are tested locally. **Nothing has been deployed to Azure yet**: we are still waiting for the hackathon's Azure access. The "What has been tested" section says exactly what was checked.

**Region: South Africa North** (`southafricanorth`), decided by Kara on 24 Nov 2026 as the closest Azure region to Nigeria. Report data is therefore stored and processed outside Nigeria. The cross-border basis under the Nigeria Data Protection Act is in [Data location and cross-border transfer](#data-location-and-cross-border-transfer) below. The same text is offered for section 3 of the Safety document, which C15 owns.

## What gets created

One resource group, inside one virtual network (`10.40.0.0/16`):

| Part | Azure resource | Notes |
|---|---|---|
| Public entry | Container App `gateway` (nginx) | The only public endpoint. Azure terminates TLS. It applies the same headers, host check and sign-in rate limit as the Compose gateway. |
| Web app | Container App `frontend` | Internal TCP ingress on port 3000. |
| API | Container App `backend` (gunicorn) | Internal TCP ingress on port 8000. Readiness probe on `/health/ready`. |
| Video and voice-note worker (C12) | Container App `media-worker`, or a job started every minute | `MEDIA_WORKER_MODE=app` (default) or `scheduled`. `MEDIA_WORKER_REPLICAS` (1–4) share the queue safely. It has no port, so Container Apps cannot probe it. A crash restarts the process, each item has a timeout and a CPU limit, and a stuck item's claim expires after 20 minutes so it is picked up again. |
| Triage worker | Container App `triage-worker` | Only with `DEPLOY_TRIAGE_WORKER=true`, as with the Compose `triage` profile. |
| Database | Azure Database for PostgreSQL Flexible Server 17 | Private subnet with no public endpoint. Burstable B1ms. 7-day point-in-time restore. |
| Database roles | Job `<prefix>-db-init` | Creates `electraguard_migrator` and `electraguard_runtime`, with the same split as `deploy/postgres-init.sh`. Safe to rerun. |
| Migrations | Job `<prefix>-migrate` | Runs `migrate` as the migrator role before the apps are updated. |
| Private media | Azure Files share `private-media` (zone-redundant) | Mounted at `/var/lib/electraguard/media` in the backend and workers. Reachable only from the apps subnet. Deleted shares are kept for 14 days. |
| Secrets | Key Vault (RBAC, purge protection; `vault.bicep`) | `django-secret`, `postgres-bootstrap`, `postgres-migrator` and `postgres-runtime`. `deploy.sh` generates them straight into Key Vault, never to disk or a command line. The person deploying can write secrets only while `infra` runs; the access is removed at the end, even if the run fails. PostgreSQL reads its administrator password from Key Vault during deployment. The apps get the secrets as files under `/run/secrets`, the same layout Compose uses. |
| Images | Azure Container Registry (Basic, no admin user) | Built in Azure from the committed tree by `az acr build`. Pulled by a managed identity. |
| Logs | Log Analytics workspace (30 days) | Container output only. The apps do not log report content. |

The frontend image reads the API through `gateway:8081`. The gateway therefore also exposes port 8081 inside the environment only. As in Compose, that port accepts only `GET /api/…`.

## Before the first deployment

1. **Azure CLI** 2.60 or later, signed in with `az login`, with the target subscription selected.
2. **Permissions.** The account needs **Owner**, or **Contributor plus User Access Administrator**, on the resource group or subscription. The template creates role assignments: the registry pull, Key Vault read for the apps, and Key Vault write for the person deploying.
3. **Region.** `southafricanorth` is the default (see Status above). Azure has no region in Nigeria. Changing `AZURE_LOCATION` changes where report data is stored, so update the data location section below and the Safety document first.
4. **Host name.** Decide the public host, for example `electraguard.example.org`. You need control of its DNS.

## Deploy

From the repository root, at the commit you want to deploy:

```bash
export AZURE_RESOURCE_GROUP=electraguard-demo ELECTRAGUARD_HOST=electraguard.example.org
```

```bash
deploy/azure/deploy.sh all
```

`all` runs three steps, which can also be run on their own:

1. `infra` creates Key Vault and generates the four secrets once, straight into it. Then it creates the network, logs, registry, media share and PostgreSQL, and removes the deployer's write access to Key Vault.
2. `images [RELEASE]` builds `electraguard-backend`, `-frontend`, `-gateway` and `-db-init` in the registry. RELEASE defaults to the current commit hash. Uncommitted changes are never included.
3. `apps [RELEASE]` deploys the two jobs, runs the database-role job and then migrations, and only then rolls out the apps. If a job fails, the script stops and prints the command that shows its logs. The apps are left on the previous release.

Optional settings, as environment variables: `AZURE_LOCATION` (default `southafricanorth`), `ELECTRAGUARD_PREFIX` (default `electraguard`, letters and digits only), `OBSERVATION_INTAKE_ENABLED` (default `false`), `DEPLOY_TRIAGE_WORKER`, `MEDIA_WORKER_MODE`, `MEDIA_WORKER_CPU` (`1.0`, `2.0` or `4.0`; default `2.0`) and `MEDIA_WORKER_REPLICAS` (default 1).

### Bind the host name and certificate

`deploy.sh` prints the gateway's default address (`…azurecontainerapps.io`). Point your host at it, then add a free managed certificate:

```bash
az containerapp env show -g "$AZURE_RESOURCE_GROUP" -n electraguard-env --query properties.customDomainConfiguration.customDomainVerificationId -o tsv
```

Create these two DNS records:
- `CNAME <host> → <gateway default address>`
- `TXT asuid.<host> → <the verification id above>`

Then add and bind the host:

```bash
az containerapp hostname add -g "$AZURE_RESOURCE_GROUP" -n gateway --hostname "$ELECTRAGUARD_HOST"
```

```bash
az containerapp hostname bind -g "$AZURE_RESOURCE_GROUP" -n gateway --hostname "$ELECTRAGUARD_HOST" --environment electraguard-env --validation-method CNAME
```

The gateway answers `421` for any other host name, so the site works only once `ELECTRAGUARD_HOST` is bound.

### First account and reference data

Run one-off commands in the backend, for example:

```bash
az containerapp exec -g "$AZURE_RESOURCE_GROUP" -n backend --command "/usr/local/bin/electraguard-django python manage.py load_reference_areas"
```

Use synthetic data only. Intake stays paused until `OBSERVATION_INTAKE_ENABLED=true` and the apps are redeployed.

## Deploy from GitHub Actions

`.github/workflows/deploy-azure.yml` runs `deploy.sh` by hand (**Actions → Deploy to Azure → Run workflow**), using OpenID Connect. No Azure password is stored in GitHub.

1. Create an app registration and service principal. Give it the permissions in "Before the first deployment".
2. Add a federated credential for the `karakaraye/Electraguard-Ai` repository and the `azure` environment.
3. In the repository settings, create the `azure` environment with **required reviewers**. Add these variables:
   - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
   - `AZURE_DEPLOYER_OBJECT_ID`: the service principal's object id
   - `AZURE_RESOURCE_GROUP`, `ELECTRAGUARD_HOST`, and optionally `AZURE_LOCATION` (default `southafricanorth`)
   - optionally `ELECTRAGUARD_PREFIX`, `OBSERVATION_INTAKE_ENABLED`, `DEPLOY_TRIAGE_WORKER`, `MEDIA_WORKER_MODE`, `MEDIA_WORKER_CPU` and `MEDIA_WORKER_REPLICAS`

## Update and roll back

- **Update:** `deploy/azure/deploy.sh images && deploy/azure/deploy.sh apps`. Run them at the new commit, or run the workflow.
- **Roll back the apps:** `deploy/azure/deploy.sh apps <previous release>`. This works while the previous release's migrations are compatible with the current schema.
- **Roll back the database:** use PostgreSQL point-in-time restore to a new server (`az postgres flexible-server restore`). Then point the apps at it, following the isolated-restore approach in `docs/restore-verification.md`.

## Backups

- **PostgreSQL:** automatic backups with 7-day point-in-time restore (`postgresBackupDays`).
- **Private media:** zone-redundant storage, with a 14-day soft-delete for the share. Take a share snapshot before risky changes:

  ```bash
  az storage share snapshot --account-name <account> --name private-media
  ```

  The account accepts only the apps subnet. Run this from inside the network, or add a temporary firewall rule for your address and remove it afterwards.
- The Compose `backup-encrypted.sh` bundle is not yet adapted for Azure. That is a follow-up.

## What has been tested

These were tested locally, in this repository's cloud workspace:
- **Gateway image.** Built and run with nginx next to stub backend and frontend containers.
  - `/api` and the rest are routed correctly, and a wrong host gets `421`.
  - The internal port 8081 allows only `GET /api/…`.
  - A forged `X-Forwarded-For` entry is ignored.
  - The sign-in rate limit counts each real client separately: 21 accepted, then `429`.
- **`db-init.sh`.** Run twice against PostgreSQL 17 as an administrator that can create roles but is not a superuser, as on Azure.
  - Migrations then ran as `electraguard_migrator`.
  - The app ran as `electraguard_runtime`: it can read and write, `CREATE TABLE` is refused, and `migrate --check` passes.
  - Secrets were mounted as files, as Container Apps does.
- **`deploy.sh`.** The full `all` run was executed against a stand-in `az` that records every call. That checked:
  - the order of stages and jobs
  - that the four secrets are random, written once, and never appear in any command line
  - that the deployer's Key Vault write access is removed after `infra`, also when the run fails
  - that the build context holds committed files only
- **Bicep.** `main.bicep`, `vault.bicep` and `postgres.bicep` compile with Bicep 0.48.1 with no warnings, and `bicep lint` is clean. Rerun before each deploy:

  ```bash
  az bicep build --file deploy/azure/main.bicep
  ```

- **Lint.** `deploy.sh` and `db-init.sh` pass shellcheck. The workflow passes actionlint.

**Not yet tested**, because it needs Azure:
- Real Azure behaviour still to confirm on the first deployment:
  - TCP ingress keeping the gateway's `Host` header
  - the internal `additionalPortMappings` port
  - SMB mount ownership through `mountOptions`
  - Key Vault references becoming available while role assignments propagate
  - the managed certificate flow
- Performance and cost on Azure. The load test and cost estimate are C13.

## Known limits

- Media is stored on an Azure Files share mounted into the containers, not in Blob Storage. The API streams every download after its permission check, and there are no 60-second storage links. This keeps the application unchanged. Moving to Blob Storage would need a storage backend in the app.
- `DJANGO_AUTH_TRUSTED_PROXY_IPS` is not set, the same as in Compose. Django therefore sees the gateway, not the client, as the peer. Per-client limits happen in the gateway.
- Key Vault and the registry keep their public endpoints, protected by Microsoft Entra ID and RBAC, so the deploy runner can reach them. Private endpoints can be added later.
- The backend image with the Whisper model is about 2.7 GB. The first pull on a new replica takes a while.

## Data location and cross-border transfer

**Decision (Kara, 24 Nov 2026):** the hosted system runs in Microsoft Azure's **South Africa North** region (Johannesburg). Azure has no region in Nigeria, and South Africa North is the closest one. Everything ElectraGuard stores is therefore held and processed outside Nigeria:
- reports
- observer codes
- photos, videos and voice notes
- transcripts
- the audit log
- backups

This applies to the Azure deployment only. The offline laptop stack (`docker compose up`) keeps everything on that machine.

### What stays in the region

These all live in South Africa North:
- the PostgreSQL database and its backups (geo-redundant backup is turned off)
- the private media share (zone-redundant storage, which replicates within the region only)
- Key Vault
- the container registry
- the log workspace

Speech transcription and face blurring run inside our own containers. No report data is sent to any other AI provider (plan section 6.1). Logs hold container output only; the application does not log report content.

### Basis under the Nigeria Data Protection Act 2023

Part VIII of the Act covers cross-border transfers (sections 41 to 43). Personal data may leave Nigeria only where:
- the recipient is bound by a law, binding corporate rules, contractual clauses, a code of conduct or a certification that gives an adequate level of protection, or
- another basis listed in section 43 applies, for example informed consent.

The controller must record the basis and its assessment of adequacy.

Our position, **to be confirmed with the legal and data-protection mentor clinic before any real data is used**:

1. **During the hackathon only synthetic data is processed.** No real person's data is transferred, so the transfer rules are not yet engaged. Every screen and document says the data is synthetic.
2. **For any later use with real observers**, the intended basis is adequacy under section 41(1):
   - South Africa's Protection of Personal Information Act 2013 (POPIA) is a comprehensive data protection law with an independent regulator.
   - Microsoft's Products and Services Data Protection Addendum includes contractual commitments on processing, security and sub-processors.
   - The transfer, its basis and the adequacy assessment must be recorded before go-live, and any guidance from the Nigeria Data Protection Commission must be checked.
3. **Data minimisation reduces what crosses the border:**
   - no names or GPS for observers
   - observer codes instead of identities
   - metadata stripped from all media
   - faces blurred on request, and blurred for reviewers by default
   - withdrawal deletes the report's content and media
4. **The privacy notice must say where data is held.** Observers and citizens must be told that their reports are stored in South Africa, at screen O-02 (privacy notice) and on the public pages. This needs the copy owner to add one line in all five languages.

### Changing the region

Changing `AZURE_LOCATION` in `deploy/azure/deploy.sh` changes where data is stored. Update this section and the Safety document first.
