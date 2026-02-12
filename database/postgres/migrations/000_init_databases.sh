#!/bin/bash
set -e

# Create the Keycloak database and user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER keycloak WITH PASSWORD 'dev_password';
    CREATE DATABASE keycloak OWNER keycloak;
    GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;

    CREATE USER mp_app WITH PASSWORD 'dev_password';
    GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO mp_app;
EOSQL
