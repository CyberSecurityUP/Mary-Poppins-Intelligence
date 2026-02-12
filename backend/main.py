"""
Mary Poppins — Main Application Entry Point
FastAPI application with service initialization and middleware stack.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from config.settings import get_settings
from middleware.audit import AuditLogger, AuditMiddleware

logger = logging.getLogger("mp")

# ──────────────────────────────────────────────────────────────────────
# Application lifespan
# ──────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and tear down application resources."""
    settings = get_settings()
    logger.info("Mary Poppins starting — environment=%s", settings.app.environment.value)

    # Initialize database connections
    # from database import init_postgres, init_neo4j, init_elasticsearch, init_redis
    # app.state.pg = await init_postgres(settings.postgres)
    # app.state.neo4j = await init_neo4j(settings.neo4j)
    # app.state.es = await init_elasticsearch(settings.elasticsearch)
    # app.state.redis = await init_redis(settings.redis)

    # Initialize audit logger
    # app.state.audit = AuditLogger(app.state.pg, app.state.es)
    # await app.state.audit.initialize()

    # Initialize AI models (if classifier service runs in-process)
    # from services.ai_classifier.service import AIClassifierService
    # app.state.classifier = AIClassifierService(settings.classifier, model_registry)
    # await app.state.classifier.initialize()

    # Initialize geolocation databases
    # from services.geolocation.service import GeolocationService
    # app.state.geo = GeolocationService(settings.geo)
    # await app.state.geo.initialize()

    logger.info("Mary Poppins initialized successfully")

    yield

    # Cleanup
    logger.info("Mary Poppins shutting down")
    # await app.state.pg.close()
    # await app.state.neo4j.close()
    # await app.state.es.close()
    # await app.state.redis.close()


# ──────────────────────────────────────────────────────────────────────
# Application factory
# ──────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Mary Poppins",
        description=(
            "Digital Intelligence Platform for CSAM prevention, "
            "OSINT investigations, cryptocurrency tracing, and "
            "intelligence correlation."
        ),
        version=settings.app.version,
        lifespan=lifespan,
        docs_url="/docs" if settings.app.debug else None,
        redoc_url="/redoc" if settings.app.debug else None,
    )

    # ── Middleware stack (order matters — outermost first) ────────
    # Trusted hosts
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.app.allowed_hosts,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.app.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-RateLimit-Remaining"],
    )

    # Gzip compression
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Audit logging (innermost — captures all API actions)
    # app.add_middleware(AuditMiddleware, audit_logger=app.state.audit)

    # ── Route registration ───────────────────────────────────────
    # from api.routes import (
    #     auth_router, cases_router, ingest_router, hashes_router,
    #     classify_router, grooming_router, osint_router, darkweb_router,
    #     crypto_router, graph_router, geo_router, alerts_router,
    #     dashboard_router, settings_router, audit_router,
    # )
    #
    # app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
    # app.include_router(cases_router, prefix="/api/v1/cases", tags=["Cases"])
    # app.include_router(ingest_router, prefix="/api/v1/ingest", tags=["Ingestion"])
    # app.include_router(hashes_router, prefix="/api/v1/hashes", tags=["Hashes"])
    # app.include_router(classify_router, prefix="/api/v1/classify", tags=["Classification"])
    # app.include_router(grooming_router, prefix="/api/v1/grooming", tags=["Grooming Detection"])
    # app.include_router(osint_router, prefix="/api/v1/osint", tags=["OSINT"])
    # app.include_router(darkweb_router, prefix="/api/v1/darkweb", tags=["Dark Web"])
    # app.include_router(crypto_router, prefix="/api/v1/crypto", tags=["Cryptocurrency"])
    # app.include_router(graph_router, prefix="/api/v1/graph", tags=["Graph Intelligence"])
    # app.include_router(geo_router, prefix="/api/v1/geo", tags=["Geolocation"])
    # app.include_router(alerts_router, prefix="/api/v1/alerts", tags=["Alerts"])
    # app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
    # app.include_router(settings_router, prefix="/api/v1/settings", tags=["Settings"])
    # app.include_router(audit_router, prefix="/api/v1/audit", tags=["Audit"])

    # ── Health endpoints ─────────────────────────────────────────
    @app.get("/health", tags=["System"])
    async def health_check():
        return {"status": "healthy", "service": "mary-poppins"}

    @app.get("/ready", tags=["System"])
    async def readiness_check():
        # Would check all service dependencies
        return {"status": "ready"}

    return app


# ──────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────

app = create_app()

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.app.host,
        port=settings.app.port,
        workers=settings.app.workers,
        reload=settings.app.debug,
        log_level=settings.app.log_level.value.lower(),
    )
