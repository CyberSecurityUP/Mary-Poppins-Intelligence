"""
Mary Poppins — OSINT Worker
Asynchronous OSINT queries dispatched from the API layer.
"""

from __future__ import annotations

import logging
import time

from workers.celery_app import app

logger = logging.getLogger("mp.worker.osint")


@app.task(name="workers.osint.run_query", bind=True, max_retries=3)
def run_query(self, query_id: str, query_type: str, value: str, modules: list[str] | None = None) -> dict:
    """
    Execute an OSINT query across enabled modules.
    Called asynchronously from the OSINT API endpoint.
    """
    start = time.monotonic()
    logger.info("OSINT query %s: type=%s value_len=%d", query_id, query_type, len(value))

    try:
        # In production: instantiate OsintService and call search()
        # from services.osint.service import OsintService
        result = {
            "query_id": query_id,
            "query_type": query_type,
            "status": "completed",
            "findings_count": 0,
            "modules_queried": modules or [],
            "elapsed_ms": int((time.monotonic() - start) * 1000),
        }

        logger.info("OSINT query %s completed in %dms", query_id, result["elapsed_ms"])
        return result

    except Exception as exc:
        logger.error("OSINT query %s failed: %s", query_id, exc)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


@app.task(name="workers.osint.bulk_search", bind=True)
def bulk_search(self, job_id: str, queries: list[dict]) -> dict:
    """Execute multiple OSINT queries as a batch job."""
    results = []
    for q in queries:
        task = run_query.delay(
            query_id=f"{job_id}-{len(results)}",
            query_type=q["query_type"],
            value=q["value"],
            modules=q.get("modules"),
        )
        results.append({"query": q, "task_id": task.id})

    return {"job_id": job_id, "total_queries": len(queries), "tasks": results}


@app.task(name="workers.osint.enrich_entity")
def enrich_entity(entity_id: str, entity_type: str, identifiers: dict) -> dict:
    """Enrich an existing entity with additional OSINT data."""
    logger.info("Enriching entity %s (%s)", entity_id, entity_type)
    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "enrichments_added": 0,
        "status": "completed",
    }
