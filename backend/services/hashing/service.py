"""
Mary Poppins — Perceptual Hashing Service
Computes pHash, PDQ, and PhotoDNA hashes for media content.
Performs similarity searches against known hash databases.
"""

from __future__ import annotations

import logging
import struct
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np

logger = logging.getLogger("mp.hashing")


@dataclass
class HashResult:
    sha256: str
    phash: Optional[str] = None
    pdq_hash: Optional[str] = None
    pdq_quality: Optional[int] = None
    photodna_hash: Optional[bytes] = None
    computed_at: datetime = field(default_factory=datetime.utcnow)
    errors: list[str] = field(default_factory=list)


@dataclass
class SimilarityMatch:
    sha256: str
    hash_type: str  # phash, pdq, photodna
    distance: int
    matched_database: str  # ncmec, interpol, custom, etc.
    classification: str
    confidence: float


class PerceptualHashService:
    """
    Computes multiple perceptual hash types and searches for matches
    in known CSAM hash databases.

    Supported algorithms:
    - pHash: DCT-based perceptual hash (64-bit)
    - PDQ: Facebook's perceptual hash for images (256-bit)
    - PhotoDNA: Microsoft's robust hash (144-byte, via API)
    """

    def __init__(self, settings, hash_db, photodna_client=None):
        self._settings = settings
        self._hash_db = hash_db
        self._photodna = photodna_client
        self._hamming_threshold = settings.hamming_distance_threshold

    # ── Hash computation ─────────────────────────────────────────────

    async def compute_all_hashes(self, content: bytes, sha256: str) -> HashResult:
        """Compute all configured perceptual hashes for the given content."""
        result = HashResult(sha256=sha256)

        if self._settings.enable_phash:
            try:
                result.phash = await self._compute_phash(content)
            except Exception as e:
                logger.error("pHash computation failed: sha256=%s err=%s", sha256, e)
                result.errors.append(f"phash: {e}")

        if self._settings.enable_pdq:
            try:
                pdq, quality = await self._compute_pdq(content)
                result.pdq_hash = pdq
                result.pdq_quality = quality
            except Exception as e:
                logger.error("PDQ computation failed: sha256=%s err=%s", sha256, e)
                result.errors.append(f"pdq: {e}")

        if self._settings.enable_photodna and self._photodna:
            try:
                result.photodna_hash = await self._compute_photodna(content)
            except Exception as e:
                logger.error("PhotoDNA computation failed: sha256=%s err=%s", sha256, e)
                result.errors.append(f"photodna: {e}")

        return result

    async def _compute_phash(self, content: bytes) -> str:
        """
        Compute 64-bit DCT-based perceptual hash.
        Uses imagehash library with PIL.
        """
        from io import BytesIO

        import imagehash
        from PIL import Image

        img = Image.open(BytesIO(content))
        # Convert to grayscale, resize to 32x32, compute DCT
        h = imagehash.phash(img, hash_size=8)
        return str(h)

    async def _compute_pdq(self, content: bytes) -> tuple[str, int]:
        """
        Compute Facebook's PDQ hash (256-bit).
        Returns (hash_hex, quality_score).
        """
        from io import BytesIO

        from PIL import Image

        # PDQ implementation via ThreatExchange pdqhash library
        import pdqhash

        img = Image.open(BytesIO(content))
        img_array = np.array(img.convert("RGB"))
        hash_vector, quality = pdqhash.compute(img_array)

        # Convert boolean array to hex string
        hash_hex = "".join(
            format(
                int("".join(str(int(b)) for b in hash_vector[i:i + 8]), 2),
                "02x",
            )
            for i in range(0, len(hash_vector), 8)
        )
        return hash_hex, int(quality)

    async def _compute_photodna(self, content: bytes) -> bytes:
        """
        Compute PhotoDNA hash via Microsoft's API.
        Returns 144-byte hash.
        """
        return await self._photodna.compute_hash(content)

    # ── Similarity search ────────────────────────────────────────────

    async def search_known_databases(self, hash_result: HashResult) -> list[SimilarityMatch]:
        """
        Search all configured hash databases for matches.
        Uses Hamming distance for perceptual hash comparison.
        """
        matches: list[SimilarityMatch] = []

        if hash_result.phash:
            phash_matches = await self._hash_db.search_phash(
                hash_result.phash,
                max_distance=self._hamming_threshold,
            )
            for m in phash_matches:
                matches.append(SimilarityMatch(
                    sha256=hash_result.sha256,
                    hash_type="phash",
                    distance=m["distance"],
                    matched_database=m["database"],
                    classification=m["classification"],
                    confidence=1.0 - (m["distance"] / 64.0),
                ))

        if hash_result.pdq_hash:
            pdq_matches = await self._hash_db.search_pdq(
                hash_result.pdq_hash,
                max_distance=self._hamming_threshold,
            )
            for m in pdq_matches:
                matches.append(SimilarityMatch(
                    sha256=hash_result.sha256,
                    hash_type="pdq",
                    distance=m["distance"],
                    matched_database=m["database"],
                    classification=m["classification"],
                    confidence=1.0 - (m["distance"] / 256.0),
                ))

        if hash_result.photodna_hash:
            pdna_matches = await self._hash_db.search_photodna(
                hash_result.photodna_hash,
                max_distance=self._hamming_threshold,
            )
            for m in pdna_matches:
                matches.append(SimilarityMatch(
                    sha256=hash_result.sha256,
                    hash_type="photodna",
                    distance=m["distance"],
                    matched_database=m["database"],
                    classification=m["classification"],
                    confidence=m.get("confidence", 0.9),
                ))

        return matches

    # ── Hamming distance utilities ───────────────────────────────────

    @staticmethod
    def hamming_distance_hex(hash1: str, hash2: str) -> int:
        """Compute Hamming distance between two hex-encoded hashes."""
        if len(hash1) != len(hash2):
            raise ValueError("Hash lengths must match")
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        xor = val1 ^ val2
        return bin(xor).count("1")

    @staticmethod
    def hamming_distance_bytes(hash1: bytes, hash2: bytes) -> int:
        """Compute Hamming distance between two byte-array hashes."""
        if len(hash1) != len(hash2):
            raise ValueError("Hash lengths must match")
        distance = 0
        for b1, b2 in zip(hash1, hash2):
            distance += bin(b1 ^ b2).count("1")
        return distance


# ──────────────────────────────────────────────────────────────────────
# Hash database interface
# ──────────────────────────────────────────────────────────────────────

class HashDatabaseInterface:
    """
    Interface for known hash databases (NCMEC, INTERPOL ICSE,
    Project VIC, custom).

    Implementations use VP-trees or locality-sensitive hashing (LSH)
    for efficient nearest-neighbor search in Hamming space.
    """

    async def search_phash(self, hash_hex: str, max_distance: int) -> list[dict]:
        raise NotImplementedError

    async def search_pdq(self, hash_hex: str, max_distance: int) -> list[dict]:
        raise NotImplementedError

    async def search_photodna(self, hash_bytes: bytes, max_distance: int) -> list[dict]:
        raise NotImplementedError

    async def add_hash(self, hash_type: str, hash_value: str | bytes,
                       database: str, classification: str) -> None:
        raise NotImplementedError
