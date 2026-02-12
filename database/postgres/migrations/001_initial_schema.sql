-- Mary Poppins — Initial Database Schema
-- PostgreSQL 16 with Row-Level Security

-- ═══════════════════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Trigram similarity for fuzzy search

-- ═══════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE user_role AS ENUM ('admin', 'analyst', 'investigator', 'auditor', 'readonly');
CREATE TYPE case_status AS ENUM ('open', 'in_progress', 'pending_review', 'closed', 'archived');
CREATE TYPE case_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE content_classification AS ENUM ('safe', 'suggestive', 'nsfw', 'nsfl', 'csam_suspect', 'csam_confirmed');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'high', 'critical');
CREATE TYPE entity_type AS ENUM ('person', 'email', 'phone', 'username', 'ip_address', 'domain', 'crypto_wallet', 'content_hash', 'forum_post', 'onion_service');
CREATE TYPE data_source_type AS ENUM ('local_upload', 'url_fetch', 'cloud_bucket', 'crawler', 'osint_module', 'darkweb_crawler', 'manual_entry', 'api_import');
CREATE TYPE grooming_risk_level AS ENUM ('none', 'low', 'medium', 'high', 'critical');

-- ═══════════════════════════════════════════════════════════════════
-- Core Tables
-- ═══════════════════════════════════════════════════════════════════

-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keycloak_id     VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(320) UNIQUE NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'readonly',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    clearance_level INTEGER NOT NULL DEFAULT 1 CHECK (clearance_level BETWEEN 1 AND 5),
    department      VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_keycloak ON users (keycloak_id);
CREATE INDEX idx_users_role ON users (role);

-- Cases
CREATE TABLE cases (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number          VARCHAR(50) UNIQUE NOT NULL,
    title                VARCHAR(500) NOT NULL,
    description          TEXT,
    status               case_status NOT NULL DEFAULT 'open',
    priority             case_priority NOT NULL DEFAULT 'medium',
    classification_level INTEGER NOT NULL DEFAULT 1 CHECK (classification_level BETWEEN 1 AND 5),
    warrant_reference    VARCHAR(255),
    warrant_expires      TIMESTAMPTZ,
    legal_authority      VARCHAR(500),
    created_by           UUID NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at            TIMESTAMPTZ,
    metadata_json        JSONB
);

CREATE INDEX idx_cases_status ON cases (status);
CREATE INDEX idx_cases_priority ON cases (priority);
CREATE INDEX idx_cases_created ON cases (created_at);
CREATE INDEX idx_cases_number ON cases (case_number);

-- Case investigators (many-to-many)
CREATE TABLE case_investigators (
    case_id     UUID REFERENCES cases(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (case_id, user_id)
);

-- Entities (universal investigative nodes)
CREATE TABLE entities (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type      entity_type NOT NULL,
    value            VARCHAR(2000) NOT NULL,
    display_label    VARCHAR(500),
    risk_score       FLOAT NOT NULL DEFAULT 0.0,
    confidence       FLOAT NOT NULL DEFAULT 0.0,
    first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source           data_source_type NOT NULL,
    source_reference VARCHAR(2000),
    metadata_json    JSONB,
    is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_type_value ON entities (entity_type, value);
CREATE INDEX idx_entities_risk ON entities (risk_score DESC);
CREATE INDEX idx_entities_value_trgm ON entities USING gin (value gin_trgm_ops);

-- Case-entity links
CREATE TABLE case_entities (
    case_id   UUID REFERENCES cases(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    linked_by UUID REFERENCES users(id),
    notes     TEXT,
    PRIMARY KEY (case_id, entity_id)
);

-- Tags
CREATE TABLE tags (
    id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name     VARCHAR(100) UNIQUE NOT NULL,
    color    VARCHAR(7) NOT NULL DEFAULT '#6B7280',
    category VARCHAR(100)
);

CREATE TABLE entity_tags (
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    tag_id    UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entity_id, tag_id)
);

-- Content hashes
CREATE TABLE content_hashes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sha256              VARCHAR(64) UNIQUE NOT NULL,
    md5                 VARCHAR(32),
    phash               VARCHAR(64),
    pdq_hash            VARCHAR(64),
    photodna_hash       BYTEA,
    file_size_bytes     INTEGER NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    original_filename   VARCHAR(500),
    width               INTEGER,
    height              INTEGER,
    duration_seconds    FLOAT,
    exif_data           JSONB,
    classification      content_classification NOT NULL DEFAULT 'safe',
    nsfw_score          FLOAT NOT NULL DEFAULT 0.0,
    csam_score          FLOAT NOT NULL DEFAULT 0.0,
    age_estimation      FLOAT,
    known_database_match BOOLEAN NOT NULL DEFAULT FALSE,
    matched_database    VARCHAR(100),
    source              data_source_type NOT NULL,
    source_url          VARCHAR(2000),
    entity_id           UUID REFERENCES entities(id),
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzed_at         TIMESTAMPTZ,
    reported_at         TIMESTAMPTZ,
    ingested_by         UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_hashes_sha256 ON content_hashes (sha256);
CREATE INDEX idx_hashes_phash ON content_hashes (phash);
CREATE INDEX idx_hashes_pdq ON content_hashes (pdq_hash);
CREATE INDEX idx_hashes_classification ON content_hashes (classification);
CREATE INDEX idx_hashes_csam_score ON content_hashes (csam_score DESC);
CREATE INDEX idx_hashes_ingested ON content_hashes (ingested_at);

-- AI classification results
CREATE TABLE ai_classification_results (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_hash_id  UUID NOT NULL REFERENCES content_hashes(id) ON DELETE CASCADE,
    model_name       VARCHAR(200) NOT NULL,
    model_version    VARCHAR(50) NOT NULL,
    category         VARCHAR(100) NOT NULL,
    score            FLOAT NOT NULL,
    raw_output       JSONB,
    processing_time_ms INTEGER NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_results_hash ON ai_classification_results (content_hash_id);

-- Grooming analyses
CREATE TABLE grooming_analyses (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_text_hash VARCHAR(64) NOT NULL,
    source_type      VARCHAR(50) NOT NULL,
    source_reference VARCHAR(2000),
    risk_level       grooming_risk_level NOT NULL,
    risk_score       FLOAT NOT NULL,
    stage_detected   VARCHAR(100),
    indicators       JSONB,
    flagged_phrases  JSONB,
    language         VARCHAR(10) NOT NULL DEFAULT 'en',
    model_name       VARCHAR(200) NOT NULL,
    model_version    VARCHAR(50) NOT NULL,
    entity_id        UUID REFERENCES entities(id),
    case_id          UUID REFERENCES cases(id),
    analyzed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzed_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_grooming_risk ON grooming_analyses (risk_level);
CREATE INDEX idx_grooming_score ON grooming_analyses (risk_score DESC);
CREATE INDEX idx_grooming_case ON grooming_analyses (case_id);

-- Crypto wallets
CREATE TABLE crypto_wallets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address         VARCHAR(200) UNIQUE NOT NULL,
    blockchain      VARCHAR(20) NOT NULL,
    cluster_id      VARCHAR(100),
    label           VARCHAR(500),
    known_service   VARCHAR(200),
    is_mixer        BOOLEAN NOT NULL DEFAULT FALSE,
    is_exchange     BOOLEAN NOT NULL DEFAULT FALSE,
    total_received  FLOAT,
    total_sent      FLOAT,
    balance         FLOAT,
    first_tx_at     TIMESTAMPTZ,
    last_tx_at      TIMESTAMPTZ,
    risk_score      FLOAT NOT NULL DEFAULT 0.0,
    entity_id       UUID REFERENCES entities(id),
    metadata_json   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_address ON crypto_wallets (address);
CREATE INDEX idx_wallets_blockchain ON crypto_wallets (blockchain);
CREATE INDEX idx_wallets_cluster ON crypto_wallets (cluster_id);

-- Crypto transactions
CREATE TABLE crypto_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash         VARCHAR(200) UNIQUE NOT NULL,
    blockchain      VARCHAR(20) NOT NULL,
    from_wallet_id  UUID REFERENCES crypto_wallets(id),
    to_wallet_id    UUID REFERENCES crypto_wallets(id),
    amount          FLOAT NOT NULL,
    amount_usd      FLOAT,
    fee             FLOAT,
    block_number    INTEGER,
    block_timestamp TIMESTAMPTZ,
    is_mixer_tx     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_json   JSONB
);

CREATE INDEX idx_tx_hash ON crypto_transactions (tx_hash);
CREATE INDEX idx_tx_from ON crypto_transactions (from_wallet_id);
CREATE INDEX idx_tx_to ON crypto_transactions (to_wallet_id);
CREATE INDEX idx_tx_timestamp ON crypto_transactions (block_timestamp);

-- OSINT results
CREATE TABLE osint_results (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_name VARCHAR(100) NOT NULL,
    query_type  VARCHAR(50) NOT NULL,
    query_value VARCHAR(2000) NOT NULL,
    result_data JSONB NOT NULL,
    confidence  FLOAT NOT NULL DEFAULT 0.0,
    source_url  VARCHAR(2000),
    entity_id   UUID REFERENCES entities(id),
    case_id     UUID REFERENCES cases(id),
    queried_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queried_by  UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_osint_module ON osint_results (module_name);
CREATE INDEX idx_osint_case ON osint_results (case_id);

-- Dark web sightings
CREATE TABLE darkweb_sightings (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    onion_url              VARCHAR(2000) NOT NULL,
    page_title             VARCHAR(1000),
    content_hash           VARCHAR(64) NOT NULL,
    content_type           VARCHAR(100) NOT NULL,
    keywords_found         JSONB,
    risk_score             FLOAT NOT NULL DEFAULT 0.0,
    classification         VARCHAR(100),
    server_headers         JSONB,
    linked_clearnet_domains JSONB,
    first_seen             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entity_id              UUID REFERENCES entities(id),
    crawl_session_id       VARCHAR(100)
);

CREATE INDEX idx_darkweb_url ON darkweb_sightings (onion_url);
CREATE INDEX idx_darkweb_risk ON darkweb_sightings (risk_score DESC);

-- Alerts
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    severity        alert_severity NOT NULL,
    title           VARCHAR(500) NOT NULL,
    description     TEXT NOT NULL,
    source_service  VARCHAR(100) NOT NULL,
    entity_id       UUID REFERENCES entities(id),
    case_id         UUID REFERENCES cases(id),
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    metadata_json   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON alerts (severity, is_acknowledged);
CREATE INDEX idx_alerts_case ON alerts (case_id);
CREATE INDEX idx_alerts_created ON alerts (created_at DESC);

-- Case notes
CREATE TABLE case_notes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    author_id     UUID NOT NULL REFERENCES users(id),
    content       TEXT NOT NULL,
    is_privileged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_case ON case_notes (case_id);

-- Evidence items
CREATE TABLE evidence_items (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_type     VARCHAR(100) NOT NULL,
    description       TEXT NOT NULL,
    hash_sha256       VARCHAR(64) NOT NULL,
    storage_ref       VARCHAR(500) NOT NULL,
    chain_of_custody  JSONB NOT NULL DEFAULT '[]',
    collected_by      UUID NOT NULL REFERENCES users(id),
    collected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json     JSONB
);

CREATE INDEX idx_evidence_case ON evidence_items (case_id);

-- Integration configs
CREATE TABLE integration_configs (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                   VARCHAR(200) UNIQUE NOT NULL,
    category               VARCHAR(50) NOT NULL,
    provider               VARCHAR(100) NOT NULL,
    base_url               VARCHAR(2000) NOT NULL,
    auth_type              VARCHAR(50) NOT NULL,
    auth_config_vault_path VARCHAR(500),
    rate_limit             INTEGER NOT NULL DEFAULT 60,
    is_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    config_json            JSONB,
    created_by             UUID NOT NULL REFERENCES users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- Audit Logs (APPEND-ONLY with hash chain)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id       UUID NOT NULL REFERENCES users(id),
    action        VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id   VARCHAR(200),
    details       JSONB,
    ip_address    INET,
    user_agent    VARCHAR(500),
    case_id       UUID REFERENCES cases(id),
    previous_hash VARCHAR(64) NOT NULL,
    entry_hash    VARCHAR(64) UNIQUE NOT NULL
);

CREATE INDEX idx_audit_timestamp ON audit_logs (timestamp);
CREATE INDEX idx_audit_user ON audit_logs (user_id);
CREATE INDEX idx_audit_action ON audit_logs (action, resource_type);
CREATE INDEX idx_audit_case ON audit_logs (case_id);

-- Prevent UPDATE and DELETE on audit_logs (immutable)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable — modification is not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- ═══════════════════════════════════════════════════════════════════
-- Row-Level Security
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

-- Investigators can only see cases they are assigned to
CREATE POLICY case_access ON cases
    USING (
        id IN (
            SELECT case_id FROM case_investigators
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
        OR current_setting('app.current_user_role') IN ('admin', 'auditor')
    );

-- Case notes follow the same access pattern
CREATE POLICY notes_access ON case_notes
    USING (
        case_id IN (
            SELECT case_id FROM case_investigators
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
        OR current_setting('app.current_user_role') IN ('admin', 'auditor')
    );

-- Evidence follows the same access pattern
CREATE POLICY evidence_access ON evidence_items
    USING (
        case_id IN (
            SELECT case_id FROM case_investigators
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
        OR current_setting('app.current_user_role') IN ('admin', 'auditor')
    );

-- ═══════════════════════════════════════════════════════════════════
-- Auto-update timestamps
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER notes_updated_at BEFORE UPDATE ON case_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON integration_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Keycloak database (separate schema)
-- ═══════════════════════════════════════════════════════════════════

CREATE DATABASE keycloak;
CREATE USER keycloak WITH ENCRYPTED PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;

-- Application user with limited privileges
CREATE USER mp_app WITH ENCRYPTED PASSWORD 'dev_password';
GRANT CONNECT ON DATABASE marypoppins TO mp_app;
GRANT USAGE ON SCHEMA public TO mp_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mp_app;

-- Auditor user (read-only + audit table access)
CREATE USER mp_auditor WITH ENCRYPTED PASSWORD 'dev_password';
GRANT CONNECT ON DATABASE marypoppins TO mp_auditor;
GRANT USAGE ON SCHEMA public TO mp_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mp_auditor;
