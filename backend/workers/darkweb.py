"""
Mary Poppins — Dark Web Crawler Worker
Tor-based crawling of .onion services. Metadata-only — no content storage.
Operates on isolated network with SOCKS proxy.
"""

from __future__ import annotations

import logging
import os
import time

from workers.celery_app import app

logger = logging.getLogger("mp.worker.darkweb")

TOR_PROXY = os.getenv("MP_DARKWEB_TOR_SOCKS_PROXY", "socks5h://localhost:9050")


@app.task(name="workers.darkweb.crawl_site", bind=True, max_retries=2)
def crawl_site(self, job_id: str, onion_url: str, depth: int = 2) -> dict:
    """
    Crawl a .onion site and extract metadata.
    Screenshots disabled by default. Only text metadata and link structures are stored.
    """
    start = time.monotonic()
    logger.info("Crawling %s (depth=%d)", onion_url[:30], depth)

    try:
        # In production: use aiohttp with aiohttp_socks to fetch via Tor
        result = {
            "job_id": job_id,
            "onion_url": onion_url,
            "pages_crawled": 0,
            "links_extracted": [],
            "keywords_found": [],
            "status": "completed",
            "elapsed_ms": int((time.monotonic() - start) * 1000),
        }

        return result

    except Exception as exc:
        logger.error("Crawl %s failed: %s", job_id, exc)
        raise self.retry(exc=exc, countdown=10)


@app.task(name="workers.darkweb.monitor_forum", bind=True)
def monitor_forum(self, forum_id: str, onion_url: str, keywords: list[str]) -> dict:
    """Monitor a dark web forum for specific keywords."""
    start = time.monotonic()
    logger.info("Monitoring forum %s for %d keywords", forum_id, len(keywords))

    return {
        "forum_id": forum_id,
        "matches_found": 0,
        "new_posts_scanned": 0,
        "elapsed_ms": int((time.monotonic() - start) * 1000),
    }


@app.task(name="workers.darkweb.check_tor_connectivity")
def check_tor_connectivity() -> dict:
    """Verify Tor SOCKS proxy is accessible."""
    # In production: attempt connection through TOR_PROXY
    return {
        "proxy": TOR_PROXY,
        "reachable": False,
        "circuit_established": False,
    }
