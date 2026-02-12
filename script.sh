#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Mary Poppins — Platform Startup Script
# Digital Intelligence Platform — Development Environment
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Constants ──────────────────────────────────────────────────────────
readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly COMPOSE_DIR="${PROJECT_ROOT}/infrastructure/docker"
readonly COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"
readonly ENV_FILE="${PROJECT_ROOT}/.env"
readonly LOG_FILE="${PROJECT_ROOT}/startup.log"

# Auto-detect Docker Compose command (plugin v2 or standalone)
COMPOSE_CMD=""
if docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
fi

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

# Service groups
readonly INFRA_SERVICES="postgres redis zookeeper kafka elasticsearch neo4j"
readonly CORE_SERVICES="core-api ingestion-worker classifier-worker osint-worker crypto-worker"
readonly WEB_SERVICES="frontend api-gateway keycloak"
readonly DARKWEB_SERVICES="tor-proxy darkweb-crawler"
readonly STORAGE_SERVICES="minio clickhouse"
readonly MONITORING_SERVICES="prometheus grafana"

# ── Banner ─────────────────────────────────────────────────────────────
banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
    __  ___                  ____                  _
   /  |/  /___ ________  __/ __ \____  ____  ____(_)___  _____
  / /|_/ / __ `/ ___/ / / / /_/ / __ \/ __ \/ __ \/ __ \/ ___/
 / /  / / /_/ / /  / /_/ / ____/ /_/ / /_/ / /_/ / / / (__  )
/_/  /_/\__,_/_/   \__, /_/    \____/ .___/ .___/_/_/ /_/____/
                  /____/           /_/   /_/
EOF
    echo -e "${NC}"
    echo -e "${DIM}  Digital Intelligence Platform — v1.0.0${NC}"
    echo -e "${DIM}  ─────────────────────────────────────────${NC}"
    echo ""
}

# ── Helpers ────────────────────────────────────────────────────────────
log()     { echo -e "${DIM}[$(date '+%H:%M:%S')]${NC} $*"; }
info()    { echo -e "${DIM}[$(date '+%H:%M:%S')]${NC} ${BLUE}INFO${NC}  $*"; }
ok()      { echo -e "${DIM}[$(date '+%H:%M:%S')]${NC} ${GREEN}  OK${NC}  $*"; }
warn()    { echo -e "${DIM}[$(date '+%H:%M:%S')]${NC} ${YELLOW}WARN${NC}  $*"; }
fail()    { echo -e "${DIM}[$(date '+%H:%M:%S')]${NC} ${RED}FAIL${NC}  $*"; }
die()     { fail "$*"; exit 1; }
section() { echo -e "\n${BOLD}${CYAN}► $*${NC}"; }

docker_compose() {
    ${COMPOSE_CMD} -f "${COMPOSE_FILE}" --project-name marypoppins "$@"
}

# ── Prerequisite Checks ───────────────────────────────────────────────
check_prerequisites() {
    section "Checking prerequisites"

    # Docker
    if command -v docker &>/dev/null; then
        local docker_ver
        docker_ver=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        ok "Docker ${docker_ver}"
    else
        die "Docker not installed. Install from https://docs.docker.com/get-docker/"
    fi

    # Docker Compose
    if [[ -n "${COMPOSE_CMD}" ]]; then
        local compose_ver
        compose_ver=$(${COMPOSE_CMD} version --short 2>/dev/null || ${COMPOSE_CMD} --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        ok "Docker Compose ${compose_ver} (${COMPOSE_CMD})"
    else
        die "Docker Compose not found. Install via 'docker compose' plugin or standalone 'docker-compose'."
    fi

    # Docker daemon running
    if docker info &>/dev/null; then
        ok "Docker daemon running"
    else
        die "Docker daemon not running. Start Docker Desktop or 'sudo systemctl start docker'."
    fi

    # Compose file exists
    if [[ -f "${COMPOSE_FILE}" ]]; then
        ok "Compose file found"
    else
        die "Compose file not found at ${COMPOSE_FILE}"
    fi

    # macOS Docker file sharing check
    if [[ "$(uname)" == "Darwin" ]]; then
        info "Checking Docker file sharing for ${PROJECT_ROOT}..."
        if docker run --rm -v "${PROJECT_ROOT}:/mnt/test:ro" alpine:3.19 ls /mnt/test &>/dev/null; then
            ok "Docker can mount ${PROJECT_ROOT}"
        else
            echo ""
            fail "Docker cannot mount ${PROJECT_ROOT}"
            echo -e ""
            echo -e "  ${BOLD}macOS Docker Desktop requires file sharing permission.${NC}"
            echo -e ""
            echo -e "  ${YELLOW}Fix:${NC} Open Docker Desktop → Settings → Resources → File Sharing"
            echo -e "       Add ${CYAN}/opt/MaryPoppins${NC} (or ${CYAN}/opt${NC}) and click ${BOLD}Apply & Restart${NC}."
            echo -e ""
            echo -e "  ${DIM}If using VirtioFS (default on newer Docker Desktop):${NC}"
            echo -e "  ${DIM}  Settings → General → ensure 'VirtioFS' is selected,${NC}"
            echo -e "  ${DIM}  then add /opt under Resources → File Sharing.${NC}"
            echo -e ""
            die "Cannot continue without file sharing access."
        fi
    fi

    # Disk space (warn if < 10GB free)
    local free_gb
    free_gb=$(df -BG "${PROJECT_ROOT}" 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}' || echo "0")
    if [[ "${free_gb}" -lt 10 ]]; then
        warn "Low disk space: ~${free_gb}GB free (recommend 10GB+)"
    else
        ok "Disk space: ~${free_gb}GB free"
    fi

    # Memory (warn if < 8GB)
    local total_mem
    if [[ "$(uname)" == "Darwin" ]]; then
        total_mem=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 ))
    else
        total_mem=$(( $(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0) / 1048576 ))
    fi
    if [[ "${total_mem}" -lt 8 ]]; then
        warn "System memory: ${total_mem}GB (recommend 8GB+ for full stack)"
    else
        ok "System memory: ${total_mem}GB"
    fi
}

# ── Environment Setup ─────────────────────────────────────────────────
setup_env() {
    section "Environment setup"

    if [[ -f "${ENV_FILE}" ]]; then
        info "Using existing .env file"
        return
    fi

    info "Creating default .env for development..."
    cat > "${ENV_FILE}" << 'ENVEOF'
# ═══════════════════════════════════════════════════════════════
# Mary Poppins — Development Environment Variables
# Generated by script.sh — edit as needed
# ═══════════════════════════════════════════════════════════════

# ── Core ──
MP_ENVIRONMENT=development
MP_DEBUG=true
MP_SECRET_KEY=dev-secret-key-change-in-production
MP_LOG_LEVEL=DEBUG

# ── PostgreSQL ──
MP_PG_HOST=postgres
MP_PG_PORT=5432
MP_PG_DATABASE=marypoppins
MP_PG_USER=mp_app
MP_PG_PASSWORD=dev_password
MP_PG_SSL_MODE=disable

# ── Neo4j ──
MP_NEO4J_URI=bolt://neo4j:7687
MP_NEO4J_USER=neo4j
MP_NEO4J_PASSWORD=dev_password
MP_NEO4J_DATABASE=marypoppins

# ── Elasticsearch ──
MP_ES_HOSTS=["http://elasticsearch:9200"]
MP_ES_USER=elastic
MP_ES_PASSWORD=dev_password
MP_ES_VERIFY_CERTS=false

# ── Redis ──
MP_REDIS_HOST=redis
MP_REDIS_PORT=6379
MP_REDIS_PASSWORD=
MP_REDIS_SSL=false

# ── Kafka ──
MP_KAFKA_BOOTSTRAP_SERVERS=["kafka:9092"]
MP_KAFKA_SECURITY_PROTOCOL=PLAINTEXT
MP_KAFKA_SASL_PASSWORD=dev_password

# ── Classifier ──
MP_CLASSIFIER_DEVICE=cpu
MP_CLASSIFIER_CONFIDENCE_THRESHOLD=0.7
MP_CLASSIFIER_CSAM_ALERT_THRESHOLD=0.85
MP_CLASSIFIER_BATCH_SIZE=16

# ── Hashing ──
MP_HASH_ENABLE_PHASH=true
MP_HASH_ENABLE_PDQ=true
MP_HASH_ENABLE_PHOTODNA=false
MP_HASH_HAMMING_DISTANCE_THRESHOLD=10

# ── OSINT ──
MP_OSINT_MAX_CONCURRENT_QUERIES=10
MP_OSINT_QUERY_TIMEOUT_SECONDS=30

# ── Crypto ──
MP_CRYPTO_MAX_TRACE_DEPTH=10
MP_CRYPTO_MIXER_DETECTION_ENABLED=true

# ── Dark Web ──
MP_DARKWEB_TOR_SOCKS_PROXY=socks5h://tor-proxy:9050
MP_DARKWEB_MAX_CONCURRENT_CRAWLERS=3
MP_DARKWEB_SCREENSHOT_ENABLED=false

# ── Ethical Safeguards ──
MP_ETHICAL_IMAGE_DISPLAY_BLOCKED=true
MP_ETHICAL_AUDIT_LOG_IMMUTABLE=true
MP_ETHICAL_PII_MASKING_IN_LOGS=true
MP_ETHICAL_DUAL_AUTHORIZATION_FOR_EXPORT=true
MP_ETHICAL_MAX_DATA_RETENTION_DAYS=365

# ── Vault (disabled for dev) ──
MP_VAULT_ENABLED=false

# ── MinIO ──
MINIO_ROOT_USER=mp_minio
MINIO_ROOT_PASSWORD=dev_password

# ── Keycloak ──
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin_dev

# ── Grafana ──
GF_SECURITY_ADMIN_PASSWORD=admin_dev
ENVEOF

    ok "Created .env with development defaults"
    warn "Change passwords before deploying to staging/production!"
}

# ── Directory Setup ───────────────────────────────────────────────────
setup_dirs() {
    section "Preparing directories"

    local dirs=(
        "${PROJECT_ROOT}/data/hashdb"
        "${PROJECT_ROOT}/data/crypto"
        "${PROJECT_ROOT}/data/geo"
        "${PROJECT_ROOT}/data/models"
        "${PROJECT_ROOT}/logs"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "${dir}"
    done
    ok "Data directories ready"
}

# ── Wait for Service ──────────────────────────────────────────────────
wait_for_service() {
    local name="$1" url="$2" max_wait="${3:-60}"
    local elapsed=0

    printf "  ${DIM}Waiting for %-20s${NC}" "${name}..."
    while [[ ${elapsed} -lt ${max_wait} ]]; do
        if curl -sf --max-time 2 "${url}" &>/dev/null; then
            echo -e " ${GREEN}ready${NC} ${DIM}(${elapsed}s)${NC}"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo -e " ${YELLOW}timeout${NC} ${DIM}(${max_wait}s)${NC}"
    return 1
}

wait_for_tcp() {
    local name="$1" host="$2" port="$3" max_wait="${4:-60}"
    local elapsed=0

    printf "  ${DIM}Waiting for %-20s${NC}" "${name}..."
    while [[ ${elapsed} -lt ${max_wait} ]]; do
        if nc -z "${host}" "${port}" 2>/dev/null; then
            echo -e " ${GREEN}ready${NC} ${DIM}(${elapsed}s)${NC}"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo -e " ${YELLOW}timeout${NC} ${DIM}(${max_wait}s)${NC}"
    return 1
}

# ── Start Commands ────────────────────────────────────────────────────
start_full() {
    section "Starting full platform stack"
    info "This will start all 16+ services (requires ~8GB RAM)"
    echo ""

    # Phase 1: Infrastructure
    info "Phase 1/4 — Infrastructure services"
    docker_compose up -d ${INFRA_SERVICES}
    echo ""

    info "Waiting for infrastructure to be healthy..."
    wait_for_tcp  "PostgreSQL"     localhost 5432  60 || true
    wait_for_tcp  "Redis"          localhost 6379  30 || true
    wait_for_tcp  "Neo4j"          localhost 7687  60 || true
    wait_for_service "Elasticsearch" "http://localhost:9200/_cluster/health" 90 || true
    wait_for_tcp  "Kafka"          localhost 9092  60 || true
    echo ""

    # Phase 2: Core services
    info "Phase 2/4 — Core API & workers"
    docker_compose up -d ${CORE_SERVICES}
    echo ""

    # Phase 3: Web, auth, storage
    info "Phase 3/4 — Frontend, gateway, auth, storage"
    docker_compose up -d ${WEB_SERVICES} ${STORAGE_SERVICES}
    echo ""

    # Phase 4: Monitoring & dark web
    info "Phase 4/4 — Monitoring & dark web crawler"
    docker_compose up -d ${MONITORING_SERVICES} ${DARKWEB_SERVICES}
    echo ""

    info "Waiting for application services..."
    wait_for_service "Core API"  "http://localhost:8080/health" 90 || true
    wait_for_service "Frontend"  "http://localhost:3000"        60 || true
    wait_for_service "Keycloak"  "http://localhost:8180"        90 || true
    wait_for_service "Grafana"   "http://localhost:3001"        30 || true
    echo ""

    print_status
}

start_minimal() {
    section "Starting minimal stack (databases + API only)"
    info "Starting infrastructure + core API only (~4GB RAM)"
    echo ""

    docker_compose up -d ${INFRA_SERVICES}
    info "Waiting for infrastructure..."
    wait_for_tcp  "PostgreSQL"     localhost 5432  60 || true
    wait_for_tcp  "Redis"          localhost 6379  30 || true
    wait_for_tcp  "Kafka"          localhost 9092  60 || true
    echo ""

    docker_compose up -d core-api
    wait_for_service "Core API" "http://localhost:8080/health" 90 || true
    echo ""

    print_status
}

start_dev() {
    section "Starting dev stack (infra + API + frontend)"
    info "Starting development environment (~6GB RAM)"
    echo ""

    docker_compose up -d ${INFRA_SERVICES}
    info "Waiting for infrastructure..."
    wait_for_tcp  "PostgreSQL"     localhost 5432  60 || true
    wait_for_tcp  "Redis"          localhost 6379  30 || true
    wait_for_tcp  "Neo4j"          localhost 7687  60 || true
    wait_for_service "Elasticsearch" "http://localhost:9200/_cluster/health" 90 || true
    wait_for_tcp  "Kafka"          localhost 9092  60 || true
    echo ""

    docker_compose up -d core-api frontend api-gateway keycloak
    info "Waiting for application..."
    wait_for_service "Core API"  "http://localhost:8080/health" 90 || true
    wait_for_service "Frontend"  "http://localhost:3000"        60 || true
    echo ""

    print_status
}

# ── Stop ──────────────────────────────────────────────────────────────
stop_all() {
    section "Stopping all services"
    docker_compose down
    ok "All services stopped"
}

stop_clean() {
    section "Stopping all services and removing volumes"
    warn "This will DELETE all data (databases, caches, etc.)"
    read -rp "  Are you sure? [y/N] " confirm
    if [[ "${confirm}" =~ ^[Yy]$ ]]; then
        docker_compose down -v --remove-orphans
        ok "All services stopped and volumes removed"
    else
        info "Cancelled"
    fi
}

# ── Status ────────────────────────────────────────────────────────────
print_status() {
    section "Service Status"
    echo ""
    docker_compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker_compose ps
    echo ""

    section "Access URLs"
    echo -e "
  ${BOLD}Application${NC}
    Frontend       ${CYAN}http://localhost:3000${NC}
    API Gateway    ${CYAN}http://localhost:8000${NC}
    Core API       ${CYAN}http://localhost:8080${NC}
    API Docs       ${CYAN}http://localhost:8080/docs${NC}

  ${BOLD}Authentication${NC}
    Keycloak       ${CYAN}http://localhost:8180${NC}       ${DIM}(admin / admin_dev)${NC}

  ${BOLD}Databases${NC}
    PostgreSQL     ${CYAN}localhost:5432${NC}              ${DIM}(mp_admin / dev_password)${NC}
    Neo4j Browser  ${CYAN}http://localhost:7474${NC}       ${DIM}(neo4j / dev_password)${NC}
    Elasticsearch  ${CYAN}http://localhost:9200${NC}
    Redis          ${CYAN}localhost:6379${NC}

  ${BOLD}Storage & Queue${NC}
    MinIO Console  ${CYAN}http://localhost:9001${NC}       ${DIM}(mp_minio / dev_password)${NC}
    Kafka          ${CYAN}localhost:9092${NC}

  ${BOLD}Monitoring${NC}
    Prometheus     ${CYAN}http://localhost:9090${NC}
    Grafana        ${CYAN}http://localhost:3001${NC}       ${DIM}(admin / admin_dev)${NC}
"
}

# ── Logs ──────────────────────────────────────────────────────────────
show_logs() {
    local service="${1:-}"
    if [[ -n "${service}" ]]; then
        docker_compose logs -f --tail=100 "${service}"
    else
        docker_compose logs -f --tail=50
    fi
}

# ── Restart ───────────────────────────────────────────────────────────
restart_service() {
    local service="${1:-}"
    if [[ -z "${service}" ]]; then
        die "Usage: $0 restart <service-name>"
    fi
    section "Restarting ${service}"
    docker_compose restart "${service}"
    ok "${service} restarted"
}

# ── Health Check ──────────────────────────────────────────────────────
health_check() {
    section "Health Check"
    echo ""

    local services=(
        "PostgreSQL|localhost|5432"
        "Redis|localhost|6379"
        "Neo4j|localhost|7687"
        "Kafka|localhost|9092"
    )
    local http_services=(
        "Core API|http://localhost:8080/health"
        "Elasticsearch|http://localhost:9200/_cluster/health"
        "Frontend|http://localhost:3000"
        "Keycloak|http://localhost:8180"
        "Neo4j Browser|http://localhost:7474"
        "MinIO|http://localhost:9001"
        "Prometheus|http://localhost:9090"
        "Grafana|http://localhost:3001"
    )

    echo -e "  ${BOLD}TCP Services${NC}"
    for svc in "${services[@]}"; do
        IFS='|' read -r name host port <<< "${svc}"
        printf "    %-20s" "${name}"
        if nc -z "${host}" "${port}" 2>/dev/null; then
            echo -e "${GREEN}● healthy${NC}"
        else
            echo -e "${RED}● down${NC}"
        fi
    done

    echo ""
    echo -e "  ${BOLD}HTTP Services${NC}"
    for svc in "${http_services[@]}"; do
        IFS='|' read -r name url <<< "${svc}"
        printf "    %-20s" "${name}"
        local code
        code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 3 "${url}" 2>/dev/null || echo "000")
        if [[ "${code}" =~ ^2[0-9][0-9]$ ]] || [[ "${code}" == "302" ]] || [[ "${code}" == "303" ]]; then
            echo -e "${GREEN}● healthy${NC} ${DIM}(${code})${NC}"
        elif [[ "${code}" != "000" ]]; then
            echo -e "${YELLOW}● degraded${NC} ${DIM}(${code})${NC}"
        else
            echo -e "${RED}● down${NC}"
        fi
    done
    echo ""
}

# ── Usage ─────────────────────────────────────────────────────────────
usage() {
    echo -e "
${BOLD}Usage:${NC} $0 <command> [options]

${BOLD}Start Commands:${NC}
  ${GREEN}start${NC}              Start full platform (all 16+ services)
  ${GREEN}start --minimal${NC}    Start databases + Core API only
  ${GREEN}start --dev${NC}        Start databases + API + frontend + auth

${BOLD}Stop Commands:${NC}
  ${RED}stop${NC}               Stop all services (preserve data)
  ${RED}stop --clean${NC}        Stop all and remove volumes (DELETE data)

${BOLD}Management:${NC}
  ${CYAN}status${NC}             Show service status and access URLs
  ${CYAN}health${NC}             Run health checks on all services
  ${CYAN}logs${NC} [service]     Tail logs (all services or specific one)
  ${CYAN}restart${NC} <service>  Restart a specific service
  ${CYAN}ps${NC}                 List running containers

${BOLD}Examples:${NC}
  $0 start               # Full stack
  $0 start --dev          # Dev environment
  $0 logs core-api        # Tail Core API logs
  $0 restart frontend     # Restart frontend only
  $0 health               # Check all services
"
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
    banner

    local command="${1:-help}"
    local option="${2:-}"

    case "${command}" in
        start)
            check_prerequisites
            setup_env
            setup_dirs
            case "${option}" in
                --minimal)  start_minimal ;;
                --dev)      start_dev     ;;
                *)          start_full    ;;
            esac
            ;;
        stop)
            case "${option}" in
                --clean)    stop_clean ;;
                *)          stop_all   ;;
            esac
            ;;
        status)     print_status     ;;
        health)     health_check     ;;
        logs)       show_logs "${option}" ;;
        restart)    restart_service "${option}" ;;
        ps)         docker_compose ps ;;
        help|--help|-h)  usage ;;
        *)
            fail "Unknown command: ${command}"
            usage
            exit 1
            ;;
    esac
}

main "$@"
