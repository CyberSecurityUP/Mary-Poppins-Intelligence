# Mary Poppins

### Digital Intelligence Platform

> *"A spoonful of data makes the criminals go down"*

Mary Poppins is a full-stack digital intelligence platform designed for CSAM prevention, OSINT investigation, cryptocurrency tracing, and dark web monitoring. It brings structure to chaos, protects the vulnerable, and ensures every element is in its proper place.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Frontend](#frontend)
- [Backend Services](#backend-services)
- [Databases](#databases)
- [Infrastructure](#infrastructure)
- [Authentication & Authorization](#authentication--authorization)
- [Multi-Tenant System](#multi-tenant-system)
- [Ethical Framework](#ethical-framework)
- [Environment Variables](#environment-variables)
- [Visual Identity](#visual-identity)
- [Scripts & Utilities](#scripts--utilities)

---

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Real-time metrics, risk timelines, alert heatmaps, service health monitoring |
| **Case Management** | Investigation cases with warrant tracking, evidence chain of custody, compartmentalization |
| **Investigations** | Maltego-style graph workspace with Cytoscape.js for entity correlation |
| **OSINT** | Modular intelligence gathering across email, username, phone, domain, IP, social profiles |
| **Crypto Tracer** | Bitcoin/Ethereum transaction tracing, wallet clustering, mixer detection |
| **Dark Web Monitor** | Tor-based crawling, forum monitoring, keyword alerts, alias correlation |
| **Content Analysis** | AI-powered NSFW/CSAM classification with ensemble models (ONNX, LLM, PhotoDNA) |
| **Alerts** | Real-time WebSocket alerts with severity routing and notification channels |
| **Audit Log** | Immutable SHA-256 hash-chained audit trail for forensic-grade chain of custody |
| **Settings** | 10-tab admin workspace: integrations, thresholds, modules, notifications, RBAC, tenants |

---

## Architecture

```
                          Frontend (React 18 + TypeScript)
                                    |
                              HTTPS / WSS
                                    |
                          API Gateway (Kong 3.6)
                                    |
                     +--------------+--------------+
                     |                             |
              Core API (FastAPI)          WebSocket Server
                     |                    (Socket.IO)
                     |
     +-------+-------+-------+-------+-------+
     |       |       |       |       |       |
  Ingest  Hashing  AI/ML   OSINT  Crypto  DarkWeb
  Worker  Service  Class.  Worker  Worker  Crawler
     |       |       |       |       |       |
     +-------+-------+---+---+-------+-------+
                         |
                    Kafka Event Bus
                         |
     +----------+--------+--------+----------+
     |          |        |        |          |
  Postgres   Neo4j   Elastic   Redis   ClickHouse
  (relat.)  (graph)  (search)  (cache)  (analytics)
                                           |
                                         MinIO
                                       (objects)
```

### Key Design Decisions

1. **Zero Visual Exposure** -- Raw images never touch disk. Bytes exist only in memory during hash computation and AI inference, then are securely discarded. The platform operates entirely on metadata, hashes, scores, and labels.

2. **Hash-Chained Audit Trail** -- Every action produces an audit entry chained to the previous via SHA-256, creating a tamper-evident log for forensic-grade chain of custody in legal proceedings.

3. **Graph-First Intelligence** -- Neo4j as the analytical backbone. 14 node types and 17 relationship types enable multi-hop correlation queries that relational databases cannot efficiently express.

4. **Modular OSINT** -- Each capability is a plugin implementing a standard interface. New modules can be added without modifying the orchestrator.

5. **Ethical by Default** -- Warrant tracking, automated data retention, mandatory review workflows, investigator well-being protections, and Ethics Review Board governance embedded in architecture.

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Python | 3.12 | Core language |
| FastAPI | 0.111+ | REST API framework |
| Uvicorn | latest | ASGI server |
| Pydantic | 2.7+ | Data validation |
| SQLAlchemy | 2.0+ | ORM (17 models, 7 enums) |
| Celery | 5.4+ | Async task queue |
| Apache Kafka | 7.6.0 | Event streaming |
| aiohttp | latest | Async HTTP client |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.5.3 | Type safety |
| Vite | 5.3.3 | Build tool |
| React Router | 6.24+ | Routing |
| React Query | 5.51.1 | Server state |
| Cytoscape.js | 3.30.1 | Graph visualization |
| ECharts | 5.5.1 | Charts & dashboards |
| Leaflet | 1.9.4 | Geographic maps |
| Tailwind CSS | 3.4.4 | Styling |
| Socket.IO | 4.7.5 | Real-time updates |

### Data Layer
| Database | Version | Purpose |
|----------|---------|---------|
| PostgreSQL | 16 | Relational data, audit logs (RLS) |
| Neo4j | 5.18 | Entity graph (14 nodes, 17 relationships) |
| Elasticsearch | 8.13.0 | Full-text search (8 indices) |
| Redis | 7 | Caching, sessions, queues |
| ClickHouse | 24.3 | Time-series analytics |
| MinIO | latest | S3-compatible object storage |

### Infrastructure
| Technology | Version | Purpose |
|-----------|---------|---------|
| Kong | 3.6 | API gateway, JWT validation, rate limiting |
| Keycloak | 24.0 | OIDC/SAML auth, MFA (TOTP + FIDO2) |
| Prometheus | 2.51.0 | Metrics collection |
| Grafana | 10.4.0 | Monitoring dashboards |
| Docker Compose | -- | Local development |
| Kubernetes | -- | Production (Istio service mesh) |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for frontend development)
- Python 3.12+ (for backend development)

### Quick Start

```bash
# Start all services
cd infrastructure/docker
docker compose up -d

# Run database migrations
docker compose exec core-api alembic upgrade head

# Initialize Neo4j graph schema
docker compose exec neo4j cypher-shell -f /var/lib/neo4j/import/graph_schema.cypher
```

### Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | `admin` / `admin_dev` |
| API | http://localhost:8080 | -- |
| API Gateway | http://localhost:8000 | -- |
| Keycloak | http://localhost:8180 | `admin` / `admin_dev` |
| Neo4j Browser | http://localhost:7474 | `neo4j` / `dev_password` |
| Grafana | http://localhost:3001 | `admin` / `admin_dev` |
| MinIO Console | http://localhost:9001 | `minioadmin` / `minioadmin` |

### Frontend Development

```bash
cd frontend
npm install
npm run dev          # Vite dev server on :3000
npm run build        # Production build
npm run type-check   # TypeScript checking
npm run lint         # ESLint
```

### Backend Development

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Built-in Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin` | `admin_dev` |
| Investigator | `investigator@mp.local` | `investigator` |
| Analyst | `analyst@mp.local` | `analyst` |
| Viewer | `viewer@mp.local` | `viewer` |

---

## Project Structure

```
MaryPoppins/
|
+-- architecture/
|   +-- SYSTEM_ARCHITECTURE.md        System design, deployment model
|
+-- backend/
|   +-- main.py                       FastAPI entry point
|   +-- api/
|   |   +-- routes.py                 15 API router modules with Pydantic schemas
|   +-- config/
|   |   +-- settings.py               Centralized Pydantic configuration (25+ blocks)
|   +-- models/
|   |   +-- database.py               SQLAlchemy ORM (17 models, 7 enums)
|   +-- middleware/
|   |   +-- audit.py                  Hash-chained audit logging with PII masking
|   +-- services/                     10 microservices (see Backend Services)
|   +-- workers/                      Celery task definitions
|   +-- requirements.txt
|   +-- Dockerfile
|
+-- frontend/
|   +-- src/
|   |   +-- App.tsx                   Router, auth context, theme, layout
|   |   +-- pages/                    10 pages (Dashboard, Cases, OSINT, etc.)
|   |   +-- components/
|   |       +-- graph/
|   |           +-- InvestigationGraph.tsx   Cytoscape.js graph workspace
|   +-- scripts/
|   |   +-- reset-platform.js         Browser console reset utility
|   +-- package.json
|   +-- vite.config.ts
|   +-- Dockerfile
|
+-- database/
|   +-- postgres/migrations/
|   |   +-- 001_initial_schema.sql    Full schema (RLS, triggers, immutable audit)
|   +-- neo4j/
|   |   +-- graph_schema.cypher       14 node types, 17 relationships, indexes
|   +-- elasticsearch/
|       +-- index_mappings.json       8 search indices
|
+-- ethical-framework/
|   +-- ETHICAL_LEGAL_FRAMEWORK.md    Legal/ethical compliance document
|
+-- infrastructure/
|   +-- docker/
|   |   +-- docker-compose.yml        Full dev stack (20 services)
|   |   +-- kong/kong.yml             API gateway routing
|   +-- k8s/
|   |   +-- core-deployment.yaml      Production K8s (HPA, NetworkPolicies)
|   +-- monitoring/
|       +-- prometheus.yml            Metrics collection
|       +-- grafana/dashboards/       Pre-built dashboards
|
+-- data/                             Crypto data, GeoIP, hash DBs, ML models
+-- docs/                             Additional documentation
+-- .env                              Development environment variables
+-- README.md
```

---

## Frontend

### Pages

| Page | File | Description |
|------|------|-------------|
| Dashboard | `Dashboard.tsx` | 8 widget types, risk timelines, geo heatmaps, service health |
| Cases | `Cases.tsx` | Case CRUD, assignment, status tracking, evidence linking |
| Investigations | `Investigations.tsx` | Graph workspace with templates, entity correlation |
| OSINT | `OSINT.tsx` | Email/username/phone/domain/IP lookups, AI agent, breach timeline |
| Crypto Tracer | `CryptoTracer.tsx` | BTC/ETH tracing, Sankey diagrams, mixer detection, clustering |
| Dark Web Monitor | `DarkWebMonitor.tsx` | Tor source monitoring, keyword alerts, threat intel feeds |
| Content Analysis | `ContentAnalysis.tsx` | AI classification queue, ensemble scoring, hash matching |
| Alerts | `Alerts.tsx` | Real-time alert feed with severity filtering |
| Settings | `Settings.tsx` | 10-tab admin: integrations, thresholds, modules, tenants, RBAC |
| Audit Log | `AuditLog.tsx` | Immutable hash-chained audit trail viewer |

### Key Components

- **InvestigationGraph** -- Cytoscape.js-powered Maltego-style entity graph with cola/dagre layouts, contextual menus, and multi-hop expansion
- **Modal** -- Reusable modal dialog component
- **Sidebar** -- Collapsible navigation with role-based route filtering and tenant switcher
- **TopBar** -- Global search, theme toggle, real-time alert bell, user menu with tenant context

---

## Backend Services

10 microservices in `backend/services/`, each with clear domain boundaries:

| Service | Path | Description |
|---------|------|-------------|
| **Ingestion** | `ingestion/` | Multi-source media upload (files, URLs, S3, folders), async pipeline |
| **Hashing** | `hashing/` | pHash, PDQ, PhotoDNA computation, Hamming distance similarity |
| **AI Classifier** | `ai-classifier/` | 5-stage NSFW/CSAM pipeline: ONNX models, ensemble, LLM analysis |
| **NLP Grooming** | `nlp-grooming/` | Transformer-based grooming detection, conversation analysis |
| **OSINT** | `osint/` | Modular plugin framework: email, username, phone, domain, IP |
| **OSINT Agent** | `osint-agent/` | LLM-powered OSINT agent with investigative guidance |
| **Crypto** | `crypto/` | BTC/ETH address tracing, wallet clustering, mixer detection |
| **Dark Web** | `darkweb/` | Tor crawler with circuit management, forum monitoring (network-isolated) |
| **Graph Engine** | `graph-engine/` | Neo4j Cypher interface, path finding, community detection |
| **Geolocation** | `geolocation/` | IP-to-geo, ASN lookup, heatmap generation |

Additional:
- **LLM Service** -- Multi-provider integration (Anthropic Claude, OpenAI, DeepSeek, OpenRouter)
- **AIOrNot Service** -- AI-generated content detection

### API Routes

15 router modules defined in `backend/api/routes.py` with full Pydantic request/response schemas. Auto-generated OpenAPI docs available at `/docs` when running the API server.

Key endpoints:
- `POST /api/v1/auth/login` -- Credential-based login
- `POST /api/v1/auth/mfa/verify` -- TOTP verification
- `POST /api/v1/auth/password/change` -- Password update
- `GET /api/v1/cases` -- Case listing with filters
- `POST /api/v1/osint/search` -- OSINT query
- `POST /api/v1/crypto/trace` -- Blockchain transaction trace
- `POST /api/v1/content/analyze` -- Content classification
- `GET /api/v1/graph/query` -- Neo4j graph queries

---

## Databases

### PostgreSQL 16

Relational backbone with row-level security:

- **users** -- Keycloak-linked accounts, roles, clearance levels
- **cases** -- Investigations with warrant references, legal authority
- **case_investigators** -- Many-to-many case assignments
- **entities** -- All entity types (persons, emails, wallets, etc.)
- **content_metadata** -- Hash metadata (SHA-256, pHash, PDQ)
- **classifications** -- AI classification results with confidence scores
- **grooming_risks** -- Grooming detection with stage assessment
- **audit_log** -- Immutable hash-chained entries (append-only, no UPDATE/DELETE)
- **alerts** -- System alerts with severity and acknowledgement tracking

Security: RLS policies ensure investigators only access assigned cases. Audit log has `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise exceptions.

### Neo4j 5.18

Entity relationship graph:

**14 Node Types:** Person, Email, Phone, Username, IPAddress, Domain, CryptoWallet, ContentHash, ForumPost, OnionService, Organization, Device, Location, WebServer

**17 Relationship Types:** OWNS_EMAIL, HAS_PHONE, USES_USERNAME, ASSOCIATED_IP, REGISTERED_DOMAIN, TRANSACTED_CRYPTO, POSTED_ON, ACCESSED_FROM, AUTHORED_BY, MENTIONS, LINKED_TO, and more

Each node carries `pg_entity_id` (FK to PostgreSQL), `case_ids` (associated investigations), and `created_by` (analyst UUID).

### Elasticsearch 8.13.0

Full-text search across 8 indices: entities, hashes, osint_results, alerts, audit_logs, darkweb_content, crypto_traces, classifications.

---

## Infrastructure

### Docker Compose (Development)

20 services in `infrastructure/docker/docker-compose.yml`:

```
core-api, frontend, api-gateway (Kong), keycloak,
ingestion-worker, classifier-worker, osint-worker,
crypto-worker, darkweb-crawler, tor-proxy,
postgres, neo4j, elasticsearch, redis,
kafka, zookeeper, minio, clickhouse,
prometheus, grafana
```

### Kubernetes (Production)

Defined in `infrastructure/k8s/core-deployment.yaml`:

- **Namespaces:** `mp-core` (services), `mp-darkweb` (Tor-isolated), `mp-data` (databases), `mp-security` (Vault, Keycloak)
- **Service mesh:** Istio with mTLS
- **Scaling:** HPA for ingestion and classifier workers
- **Security:** Non-root containers, read-only filesystems, seccomp profiles, NetworkPolicies
- **Observability:** Liveness/readiness probes, Prometheus metrics scraping

### Monitoring

- **Prometheus** scrapes all services at 15-second intervals
- **Grafana** dashboards for API latency, queue depth, classification throughput, database connections

---

## Authentication & Authorization

### Authentication Flow

```
Login Form (email + password + optional tenant)
    |
    +-- Built-in accounts (demo)
    +-- localStorage credentials (tenant users)
    +-- Keycloak SSO (production)
         |
         +-- JWT with org_id / org_name claims
         +-- Token refresh every 55 seconds
         +-- PKCE (S256) for frontend
```

### Role-Based Access Control

5-tier role system with case-level compartmentalization:

| Role | Access |
|------|--------|
| **Admin** | Full platform access, settings, audit logs, tenant management |
| **Investigator** | Cases, OSINT, crypto, dark web (assigned cases only) |
| **Analyst** | Cases (read-only), graph workspace, content review |
| **Auditor** | Audit log access only |
| **Viewer** | Dashboard and alerts (read-only) |

### Multi-Factor Authentication

- TOTP setup via `/api/v1/auth/mfa/setup` (QR code + secret)
- Verification via `/api/v1/auth/mfa/verify` (6-digit code)
- Per-user MFA toggle in tenant admin

---

## Multi-Tenant System

The platform supports multiple tenants with full data isolation:

- **Tenant creation** via Settings > Tenants (admin only)
- **New tenants start clean** -- no pre-populated data in dashboard, settings, or any module
- **Demo tenant** (`Mary Poppins Demo`) includes sample data for evaluation
- **Tenant switcher** in sidebar and user menu for users belonging to multiple tenants
- **Login-time tenant selection** when a user's email exists in multiple tenants
- **Platform reset** removes all tenants except demo, cleaning all associated data
- **Per-tenant isolation** in all modules: Dashboard, Cases, Investigations, OSINT, Crypto Tracer, Dark Web, Content Analysis, Alerts, Settings

### Superadmin Capabilities

- Create, activate, suspend, and delete tenants
- Add/remove users per tenant
- Reset and change user passwords
- Full platform reset (preserves demo tenant)
- Storage quota management per plan (Enterprise: 500GB, Standard: 100GB, Demo: 50GB)

---

## Ethical Framework

Documented in `ethical-framework/ETHICAL_LEGAL_FRAMEWORK.md`.

### Fundamental Principles

1. **Zero Visual Exposure** -- Raw images never stored, displayed, or transmitted
2. **Legal Authority Requirement** -- Every action traceable to legal basis (4-tier system)
3. **Proportionality** -- Investigative actions match suspected offense severity
4. **Accountability** -- Every action audit-logged to a specific user

### Data Classification

| Level | Protections |
|-------|-------------|
| PUBLIC | No restrictions |
| INTERNAL | Encrypted at rest |
| CONFIDENTIAL | Encrypted + access-controlled |
| RESTRICTED | Encrypted + compartmentalized + audited |
| TOP SECRET | Encrypted + dual-authorization + time-limited access |

### Safeguards

- Dual authorization for data exports
- Automated PII masking in logs
- Configurable data retention with auto-purge (crypto-shredding)
- Warrant gate on dark web modules
- Ethics Review Board approval for threshold changes
- Investigator well-being protections (exposure time limits)

---

## Environment Variables

Core configuration via `.env` file or environment:

```bash
# Core
MP_ENVIRONMENT=development
MP_DEBUG=true
MP_SECRET_KEY=dev-secret-key-change-in-production

# PostgreSQL
MP_PG_HOST=postgres
MP_PG_PORT=5432
MP_PG_DATABASE=marypoppins
MP_PG_USER=mp_app
MP_PG_PASSWORD=dev_password

# Neo4j
MP_NEO4J_URI=bolt://neo4j:7687
MP_NEO4J_USER=neo4j
MP_NEO4J_PASSWORD=dev_password

# Elasticsearch
MP_ES_HOSTS=["http://elasticsearch:9200"]

# Redis
MP_REDIS_HOST=redis
MP_REDIS_PORT=6379

# AI Classification
MP_CLASSIFIER_DEVICE=cpu           # or cuda
MP_CLASSIFIER_CSAM_ALERT_THRESHOLD=0.85

# OSINT
MP_OSINT_MAX_CONCURRENT_QUERIES=10
MP_OSINT_QUERY_TIMEOUT_SECONDS=30

# Crypto Tracing
MP_CRYPTO_MAX_TRACE_DEPTH=10
MP_CRYPTO_MIXER_DETECTION_ENABLED=true

# Dark Web
MP_DARKWEB_TOR_SOCKS_PROXY=socks5h://tor-proxy:9050
MP_DARKWEB_MAX_CONCURRENT_CRAWLERS=3

# LLM Integration
MP_LLM_DEFAULT_PROVIDER=anthropic
MP_LLM_ANTHROPIC_API_KEY=
MP_LLM_OPENAI_API_KEY=
MP_LLM_DEEPSEEK_API_KEY=

# Ethical Safeguards
MP_ETHICAL_IMAGE_DISPLAY_BLOCKED=true
MP_ETHICAL_AUDIT_LOG_IMMUTABLE=true
MP_ETHICAL_PII_MASKING_IN_LOGS=true
MP_ETHICAL_DUAL_AUTHORIZATION_FOR_EXPORT=true
```

---

## Visual Identity

Mary Poppins serves as the symbolic figure of **order, protection, and intelligence organization**.

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Navy | `#0F172A` | Primary background |
| Slate Dark | `#1E293B` | Card backgrounds |
| Royal Purple | `#6D28D9` | Primary accent, active states |
| Violet | `#8B5CF6` | Secondary accent |
| Teal | `#14B8A6` | Success, positive indicators |
| Alert Red | `#EF4444` | Critical alerts, CSAM flags |
| Warm Gold | `#F59E0B` | Warnings, crypto elements |
| Soft White | `#F1F5F9` | Primary text |
| Cool Gray | `#94A3B8` | Secondary text |

### Typography

- **Headings:** Inter (700)
- **Body:** Inter (400)
- **Monospace:** JetBrains Mono (hashes, IDs, addresses)

### Iconography

- Umbrella motif in logo and loading states
- Entity-type icons consistent across graph, tables, and cards
- Severity colors aligned across all views (red > amber > blue > gray)

---

## Scripts & Utilities

### Platform Reset Script

`frontend/scripts/reset-platform.js` -- Browser console utility that resets localStorage to a clean state while preserving specified tenants. Paste into DevTools console (F12) and reload.

Default preserved tenants: `tenant-demo`, `tenant-empty`. Edit the `KEEP_TENANTS` array to customize.

---

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| Project Overview | `PROJECT_OVERVIEW.md` | High-level overview with file structure |
| System Architecture | `architecture/SYSTEM_ARCHITECTURE.md` | Full system design, tech stack, deployment |
| Ethical Framework | `ethical-framework/ETHICAL_LEGAL_FRAMEWORK.md` | Legal/ethical compliance, data classification |
| API Docs | `/docs` (runtime) | Auto-generated OpenAPI from FastAPI |
| Database Schema | `database/postgres/migrations/` | PostgreSQL with inline comments |
| Graph Schema | `database/neo4j/graph_schema.cypher` | Neo4j nodes, relationships, indexes |
