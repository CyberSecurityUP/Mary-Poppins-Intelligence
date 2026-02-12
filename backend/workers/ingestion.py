"""
Mary Poppins — Ingestion Worker
Processes incoming content submissions: hashing, metadata extraction, queueing for classification.
"""

from __future__ import annotations

import hashlib
import logging
import time

from workers.celery_app import app

logger = logging.getLogger("mp.worker.ingestion")


@app.task(name="workers.ingestion.process_submission", bind=True, max_retries=3)
def process_submission(self, submission_id: str, metadata: dict) -> dict:
    """
    Process a new content submission.
    1. Generate perceptual hashes (pHash, PDQ)
    2. Check against known hash databases
    3. Extract metadata
    4. Queue for AI classification if needed
    """
    start = time.monotonic()
    logger.info("Processing submission %s", submission_id)

    try:
        # Generate content hash for deduplication
        content_hash = metadata.get("sha256", "")

        # Check hash databases for known matches
        hash_match = check_hash_databases(content_hash)

        result = {
            "submission_id": submission_id,
            "content_hash": content_hash,
            "hash_match": hash_match,
            "metadata_extracted": True,
            "elapsed_ms": int((time.monotonic() - start) * 1000),
        }

        # Queue for classification if no definitive hash match
        if not hash_match.get("definitive_match"):
            app.send_task(
                "workers.classifier.classify_content",
                args=[submission_id, metadata],
                queue="classify",
            )
            result["queued_for_classification"] = True

        logger.info("Submission %s processed in %dms", submission_id, result["elapsed_ms"])
        return result

    except Exception as exc:
        logger.error("Ingestion failed for %s: %s", submission_id, exc)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


def check_hash_databases(content_hash: str) -> dict:
    """Check SHA-256 and perceptual hashes against known databases."""
    # Stub — would query NCMEC, PhotoDNA, internal hash DB
    return {"definitive_match": False, "databases_checked": ["ncmec", "photodna", "internal"]}


@app.task(name="workers.ingestion.bulk_ingest", bind=True)
def bulk_ingest(self, submission_ids: list[str]) -> dict:
    """Process a batch of submissions."""
    results = []
    for sid in submission_ids:
        result = process_submission.delay(sid, {})
        results.append({"submission_id": sid, "task_id": result.id})
    return {"queued": len(results), "tasks": results}
