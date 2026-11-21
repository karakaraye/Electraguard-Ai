#!/bin/sh
set -eu

ELECTRAGUARD_MIGRATOR_PASSWORD=$(cat /run/secrets/database_migrator)
ELECTRAGUARD_RUNTIME_PASSWORD=$(cat /run/secrets/database_runtime)
export ELECTRAGUARD_MIGRATOR_PASSWORD ELECTRAGUARD_RUNTIME_PASSWORD

psql --username "$POSTGRES_USER" --dbname electraguard --set ON_ERROR_STOP=1 <<'SQL'
\getenv migrator_password ELECTRAGUARD_MIGRATOR_PASSWORD
\getenv runtime_password ELECTRAGUARD_RUNTIME_PASSWORD

BEGIN;
CREATE ROLE electraguard_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE electraguard_runtime LOGIN PASSWORD :'runtime_password';
ALTER DATABASE electraguard OWNER TO electraguard_migrator;
REVOKE ALL ON DATABASE electraguard FROM PUBLIC;
GRANT CONNECT ON DATABASE electraguard TO electraguard_runtime;
ALTER SCHEMA public OWNER TO electraguard_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO electraguard_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE electraguard_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO electraguard_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE electraguard_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO electraguard_runtime;
COMMIT;
SQL
