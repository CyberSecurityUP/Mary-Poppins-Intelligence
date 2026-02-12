"""
Mary Poppins — AIorNot Integration Service
Detects AI-generated content via the AIorNot API (https://www.aiornot.com/).

Used to determine whether flagged content was AI-generated, which affects
investigation priority and evidence classification.

CRITICAL: Only content hashes are sent to the API — raw images are NEVER
transmitted. Zero Visual Exposure is enforced at the architecture level.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("mp.aiornot")


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

class AIGeneratedVerdict(str, Enum):
    AI_GENERATED = "ai_generated"
    HUMAN_CREATED = "human_created"
    INCONCLUSIVE = "inconclusive"


@dataclass
class AIorNotResult:
    """Result from AIorNot API check."""
    hash_id: str
    verdict: AIGeneratedVerdict
    confidence: float  # 0.0 - 1.0
    ai_model_detected: Optional[str]  # e.g., "Stable Diffusion", "DALL-E", "Midjourney"
    checked_at: datetime = field(default_factory=datetime.utcnow)
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class AIorNotBatchResult:
    """Batch check results."""
    results: list[AIorNotResult]
    total_checked: int
    ai_generated_count: int
    human_created_count: int
    inconclusive_count: int
    elapsed_ms: int


# ---------------------------------------------------------------------------
# AIorNot Service
# ---------------------------------------------------------------------------

class AIorNotService:
    """Integration with the AIorNot API for AI-generated content detection.

    This service checks content hashes against the AIorNot detection system
    to determine whether flagged material was created by AI image generators.

    Zero Visual Exposure: Only hash identifiers and metadata are transmitted.
    Raw image bytes are NEVER sent to external services.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.aiornot.com/v1",
        timeout_seconds: int = 30,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._healthy = False

    async def check_content(
        self,
        hash_id: str,
        hash_value: str,
        hash_type: str = "sha256",
        metadata: Optional[dict[str, Any]] = None,
    ) -> AIorNotResult:
        """Check a single content hash against AIorNot.

        Args:
            hash_id: Internal record identifier.
            hash_value: The content hash to check.
            hash_type: Hash algorithm used (sha256, phash, pdq).
            metadata: Additional metadata for context.

        Returns:
            AIorNotResult with verdict and confidence.
        """
        start = time.monotonic()
        logger.info(
            "AIorNot check: hash_id=%s hash_type=%s",
            hash_id, hash_type,
        )

        # In production, this calls the AIorNot API:
        #   POST {base_url}/detect
        #   Headers: Authorization: Bearer {api_key}
        #   Body: { "hash": hash_value, "hash_type": hash_type }
        #
        # The API returns:
        #   { "verdict": "ai_generated|human_created",
        #     "confidence": 0.95,
        #     "ai_model": "Stable Diffusion XL",
        #     "details": {...} }

        elapsed = int((time.monotonic() - start) * 1000)
        logger.info(
            "AIorNot result: hash_id=%s elapsed=%dms",
            hash_id, elapsed,
        )

        # Placeholder — in production, parse actual API response
        return AIorNotResult(
            hash_id=hash_id,
            verdict=AIGeneratedVerdict.INCONCLUSIVE,
            confidence=0.0,
            ai_model_detected=None,
        )

    async def batch_check(
        self,
        items: list[dict[str, str]],
    ) -> AIorNotBatchResult:
        """Check multiple content hashes in batch.

        Args:
            items: List of dicts with keys: hash_id, hash_value, hash_type.

        Returns:
            Aggregated batch results.
        """
        start = time.monotonic()
        results: list[AIorNotResult] = []

        for item in items:
            result = await self.check_content(
                hash_id=item["hash_id"],
                hash_value=item["hash_value"],
                hash_type=item.get("hash_type", "sha256"),
            )
            results.append(result)

        elapsed = int((time.monotonic() - start) * 1000)

        return AIorNotBatchResult(
            results=results,
            total_checked=len(results),
            ai_generated_count=sum(
                1 for r in results if r.verdict == AIGeneratedVerdict.AI_GENERATED
            ),
            human_created_count=sum(
                1 for r in results if r.verdict == AIGeneratedVerdict.HUMAN_CREATED
            ),
            inconclusive_count=sum(
                1 for r in results if r.verdict == AIGeneratedVerdict.INCONCLUSIVE
            ),
            elapsed_ms=elapsed,
        )

    async def health_check(self) -> bool:
        """Verify connectivity to the AIorNot API."""
        try:
            # In production: GET {base_url}/health or a lightweight API call
            self._healthy = bool(self.api_key)
            return self._healthy
        except Exception as exc:
            logger.error("AIorNot health check failed: %s", exc)
            self._healthy = False
            return False

    @property
    def is_healthy(self) -> bool:
        return self._healthy
