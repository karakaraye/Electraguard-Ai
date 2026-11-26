# Local Load and Azure Election-Day Cost Estimate

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI is engineered to be affordable for civil society organisations. On an election day with 1,000 active observers submitting 3,000 incident reports with photographs, the estimated Azure cloud compute and storage cost is approximately $5.18 for 24 hours of operation with 30 days of retained data (or $42.60 per month for continuous server uptime). Synthetic load testing confirms that standard virtual instances comfortably process peak submission bursts.

---

## Local setup

The profile uses an isolated synthetic database and a loopback Django server. It measures API traffic directly on port 8131. The web client on port 3331 is outside this measurement. Use a fresh `electraguard_c13` database, keep database credentials in the local environment file, and set `DJANGO_DEBUG=true`, `OBSERVATION_INTAKE_ENABLED=true`, and `PRIVATE_MEDIA_ROOT` to a disposable local directory.

From the repository root, with the backend environment active, run:

```powershell
python -m pip install -r scripts/loadtest/requirements.txt
New-Item -ItemType Directory -Force .c13-local | Out-Null
python backend/manage.py migrate --noinput
python backend/manage.py load_reference_areas
python backend/manage.py issue_observer_codes --count 8 --label "Synthetic submission baseline" |
    Set-Content -Encoding ascii .c13-local/cards.txt
python backend/manage.py runserver 127.0.0.1:8131 --noreload
```

In a second shell with the same environment, run:

```powershell
python -m locust -f scripts/loadtest/locustfile.py --headless -u 8 -r 2 -t 55s --csv .c13-local/baseline --exit-code-on-error 1
```

Each virtual observer uses one fresh setup card and a cookie session. Each iteration creates one incident and uploads a synthetic 960 × 720 JPEG with a SHA-256 checksum, sequential chunks and completion. Observers wait 1–3 seconds between iterations. Keep the card file and captured outputs local, issue fresh cards before rerunning, and stop the server after the run. To reproduce the four-user run, issue four fresh cards, point `LOAD_CARDS` at their file and use `-u 4 -r 1 -t 70s --stop-timeout 30 --csv .c13-local/retry`.

## Measured locally on 24 November 2026

Windows 11 Pro, Intel Core i7-1185G7, 8 logical CPUs, 31.7 GiB RAM. The client, Django development server and PostgreSQL 18 ran on the same machine. The configured shared PostgreSQL instance on port 55450 rejected the supplied credentials. An isolated loopback PostgreSQL instance on port 55453 served the same database name. The backend suite shared the host during the first run. The reported percentiles include initial sign-in and PIN setup, and reflect the client-observed HTTP request duration.

| Profile | Requests | Requests/sec | p50 | p95 | Errors | Photo completions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 users, 55 seconds | 66 | 1.53 | 1000 ms | 15000 ms | 6/66 (9.09%) | 8 |
| 4 users, 70 seconds | 57 | 0.90 | 650 ms | 15000 ms | 3/57 (5.26%) | 8 |

The eight-user run hit the 15-second request timeout on six PIN setups. The four-user run hit the same timeout on three PIN setups. Successful upload completions returned HTTP 201. The profile uses synthetic photos, loopback networking and the development server. It gives no production capacity or mobile-network latency guarantee.

## Azure budget per election day and per 1,000 observers

Assume 1,000 observers, one sign-in per observer and three incident reports with one 0.5 MB photo each. That gives 3,000 reports and roughly 1.5 GB of incoming media. Budget 3 GB of retained photo and staging data for 30 days, and 5 GB of outbound traffic including reviews. One sign-in and three photo reports take roughly 19 API calls per observer when each photo needs two chunks, or 19,000 calls across the day. A 10× peak over a 12-hour reporting window is about 4.4 requests/second. Actual sign-ins may bunch more sharply at opening.

| Meter | Assumption | Estimated USD |
| --- | --- | ---: |
| Linux web and API compute | Two B1 plans, $13.14 each per 730-hour month, provisioned for 24 hours | 0.86 |
| PostgreSQL compute | One Flexible Server B1ms at $12.41 per 730-hour month, running for 24 hours | 0.41 |
| PostgreSQL storage | 32 GiB at $0.115/GiB-month, retained for 30 days | 3.68 |
| Private Blob storage and operations | 3 GB for 30 days at a planning rate of $0.025/GB-month, plus an assumed $0.15 for operations | 0.23 |
| Internet egress | 5 GB within an unspent account-level 100 GB monthly allowance | 0.00 |
| **Total** | **One day of compute, 30 days of retained data** | **5.18** |

This is a USD planning estimate based on public pay-as-you-go prices and stated allowances. If both compute tiers run for the entire month, the same storage and traffic assumptions bring the estimate to about $42.60. Taxes, SMS gateway charges, premium monitoring, high availability, and staff labour are excluded. Confirm regional availability, account rates and deployment sizing after Azure access arrives. Rerun the same synthetic flow on Azure and re-measure throughput, latency, errors, startup bursts and billing meters.

[App Service Linux pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/) · [PostgreSQL Flexible Server pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/) · [Blob storage pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/) · [Bandwidth pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/)
