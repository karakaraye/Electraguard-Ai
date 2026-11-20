# Isolated Track 5 staging

The Compose stack starts a dedicated PostgreSQL cluster, runs the Django migrations, collects static assets, and starts two WSGI workers behind an HTTPS gateway. PostgreSQL and WSGI have no published ports. The gateway is bound to `127.0.0.1` by default. This profile uses production Django settings.

## Prepare and start

1. Put the deployment's approved certificate chain and private key in an external directory as `fullchain.pem` and `privkey.pem`. The certificate must cover the exact host name used for staging. On Windows, use forward slashes in the TLS directory setting.
2. Copy `staging/staging.env.example` to `staging/.env`. Set new independent random values for the Django secret, intake credential, and database password. Set the TLS directory and allowed host name. Keep the file and the key private. Use test records only.
3. From the repository root, run these commands with a working Docker engine.

```text
docker compose --env-file staging/.env -f staging/compose.yaml config --quiet
docker compose --env-file staging/.env -f staging/compose.yaml up -d --build
docker compose --env-file staging/.env -f staging/compose.yaml ps
```

Set `TRACK5_EDGE_SUBNET` and `TRACK5_EDGE_IP` to an unused private subnet and a matching gateway address if the default subnet conflicts locally. The gateway overwrites inbound protocol and client-address headers. Keep the application's trusted proxy list scoped to that gateway. The gateway and Django leave request bodies, receipt credentials, and query strings out of routine access logs.

`prepare` should exit successfully once. The remaining three services should be running. Start the application with an empty database; create individual observation accounts for authorised trial staff. For the local staging administrator, use:

```text
docker compose --env-file staging/.env -f staging/compose.yaml exec app python manage.py createsuperuser
```

Rebuild and rerun this stack when deploying a changed migration or shell bundle. The static volume and PostgreSQL volume belong to this project. A regular `docker compose ... down` stops the stack and preserves its volumes. Keep staging secrets separate from other environments.

## Verify through HTTPS

Run the read-only smoke check with the correct certificate trust chain. Use the optional CA file only for an approved private CA.

```text
python staging/check_https.py https://localhost:8443
python staging/check_https.py https://localhost:8443 --ca-file <approved-ca.pem>
```

The check verifies normal hostname and certificate validation, TLS 1.2 or 1.3, HSTS, observer assets, service worker revalidation, the Secure CSRF cookie, sign-in routing, and unauthenticated review denial.

## Verify a shared network

The default profile supports same-machine testing. For a shared trial, place the gateway behind an approved restricted network entry point. Use the trial hostname and a certificate trusted by the target phones. Keep WSGI and database ports private. If an outer gateway sits in front of this proxy, review which peer address is visible in Django and test the combined office or mobile gateway limits.

From at least two intended devices on that network, run the HTTPS check or verify those same browser properties, including normal certificate validation without an exception. Then exercise a real observer sign-in or credential entry, offline queue and reconnect, reviewer assignment and access scope, and rate-limit recovery. Use isolated records and record the hostname, browser and device versions, network, and outcomes. A loopback pass does not verify the routing, certificate trust store, or address handling of the intended network.
