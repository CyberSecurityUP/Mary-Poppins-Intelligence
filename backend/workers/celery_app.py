"""
Mary Poppins — Celery Application Factory
Shared Celery instance for all worker types.
"""

from __future__ import annotations

import os

from celery import Celery

redis_host = os.getenv("MP_REDIS_HOST", "localhost")
redis_port = os.getenv("MP_REDIS_PORT", "6379")
redis_db = os.getenv("MP_REDIS_DB", "0")
broker_url = f"redis://{redis_host}:{redis_port}/{redis_db}"

app = Celery(
    "marypoppins",
    broker=broker_url,
    backend=broker_url,
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    task_routes={
        "workers.ingestion.*": {"queue": "ingestion"},
        "workers.classifier.*": {"queue": "classify"},
        "workers.osint.*": {"queue": "osint"},
        "workers.crypto.*": {"queue": "crypto"},
        "workers.darkweb.*": {"queue": "darkweb"},
    },
)
