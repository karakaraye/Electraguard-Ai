#!/bin/sh
# Create or update the migrator and runtime roles on Azure Database for PostgreSQL.
# The same privilege split as deploy/postgres-init.sh, but safe to run again, and
# written for Azure's administrator, which can create roles but is not a superuser.
# Runs as a Container Apps job; passwords are mounted as files under /run/secrets.
set -eu

PGPASSWORD=$(cat /run/secrets/database_bootstrap)
ELECTRAGUARD_MIGRATOR_PASSWORD=$(cat /run/secrets/database_migrator)
ELECTRAGUARD_RUNTIME_PASSWORD=$(cat /run/secrets/database_runtime)
export PGPASSWORD ELECTRAGUARD_MIGRATOR_PASSWORD ELECTRAGUARD_RUNTIME_PASSWORD

psql --dbname "${PGDATABASE:-electraguard}" --set ON_ERROR_STOP=1 <<'SQL'
\getenv migrator_password ELECTRAGUARD_MIGRATOR_PASSWORD
\getenv runtime_password ELECTRAGUARD_RUNTIME_PASSWORD

BEGIN;
SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electraguard_migrator') AS create_migrator,
       NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electraguard_runtime') AS create_runtime \gset
\if :create_migrator
CREATE ROLE electraguard_migrator LOGIN;
\endif
\if :create_runtime
CREATE ROLE electraguard_runtime LOGIN;
\endif
ALTER ROLE electraguard_migrator WITH LOGIN PASSWORD :'migrator_password';
ALTER ROLE electraguard_runtime WITH LOGIN PASSWORD :'runtime_password';
-- A non-superuser can hand ownership only to a role it can act as.
GRANT electraguard_migrator TO CURRENT_USER;
ALTER DATABASE :"DBNAME" OWNER TO electraguard_migrator;
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO electraguard_runtime;
ALTER SCHEMA public OWNER TO electraguard_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO electraguard_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE electraguard_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO electraguard_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE electraguard_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO electraguard_runtime;
COMMIT;
SQL
echo "Database roles are ready."
