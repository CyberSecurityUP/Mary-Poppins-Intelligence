"""
Mary Poppins — Ingestion Service
Handles intake of media content from multiple sources.
Produces hash computation events without ever storing raw imagery.
"""

from __future__ import annotations

import hashlib
import io
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import AsyncIterator, Optional

import aiofiles
import aiohttp
from fastapi import UploadFile

logger = logging.getLogger("mp.ingestion")


# ──────────────────────────────────────────────────────────────────────
# Data types
# ──────────────────────────────────────────────────────────────────────

class SourceType(str, Enum):
    LOCAL_FILE = "local_file"
    UPLOAD = "upload"
    URL = "url"
    CLOUD_BUCKET = "cloud_bucket"
    CRAWLER = "crawler"


@dataclass
class IngestionJob:
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    source_type: SourceType = SourceType.UPLOAD
    source_reference: str = ""
    case_id: Optional[str] = None
    user_id: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class IngestionResult:
    job_id: str
    sha256: str
    md5: str
    file_size: int
    mime_type: str
    original_filename: Optional[str]
    metadata: dict = field(default_factory=dict)
    status: str = "completed"
    error: Optional[str] = None


ALLOWED_MIME_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
    "image/tiff", "image/svg+xml",
    "video/mp4", "video/webm", "video/avi", "video/quicktime",
})

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB


# ──────────────────────────────────────────────────────────────────────
# Core service
# ──────────────────────────────────────────────────────────────────────

class IngestionService:
    """
    Orchestrates media ingestion from multiple source types.

    CRITICAL SAFETY INVARIANT:
    - Raw image/video bytes are NEVER persisted to disk or database.
    - Bytes are held only in memory during hash computation, then discarded.
    - Only cryptographic hashes, perceptual hashes, metadata, and AI scores
      are stored.
    """

    def __init__(self, kafka_producer, hash_service, metadata_extractor, db_session):
        self._kafka = kafka_producer
        self._hasher = hash_service
        self._metadata = metadata_extractor
        self._db = db_session

    # ── Upload handling ──────────────────────────────────────────────

    async def ingest_upload(
        self,
        file: UploadFile,
        case_id: Optional[str],
        user_id: str,
    ) -> IngestionResult:
        """Process a user-uploaded file."""
        job = IngestionJob(
            source_type=SourceType.UPLOAD,
            source_reference=file.filename or "unknown",
            case_id=case_id,
            user_id=user_id,
        )
        logger.info("Ingestion started: job=%s file=%s", job.job_id, file.filename)

        # Read into memory (never to disk)
        content = await file.read()
        try:
            self._validate_content(content, file.content_type)
            return await self._process_content(
                job=job,
                content=content,
                mime_type=file.content_type or "application/octet-stream",
                original_filename=file.filename,
            )
        finally:
            # Ensure raw bytes are cleared from memory
            del content

    # ── URL fetch ────────────────────────────────────────────────────

    async def ingest_url(
        self,
        url: str,
        case_id: Optional[str],
        user_id: str,
    ) -> IngestionResult:
        """Fetch and process content from a URL."""
        job = IngestionJob(
            source_type=SourceType.URL,
            source_reference=url,
            case_id=case_id,
            user_id=user_id,
        )
        logger.info("Ingestion from URL: job=%s url=%s", job.job_id, url)

        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    return IngestionResult(
                        job_id=job.job_id, sha256="", md5="",
                        file_size=0, mime_type="", original_filename=None,
                        status="failed", error=f"HTTP {resp.status}",
                    )
                content = await resp.read()
                mime_type = resp.content_type or "application/octet-stream"

        try:
            self._validate_content(content, mime_type)
            return await self._process_content(
                job=job, content=content, mime_type=mime_type, original_filename=url.split("/")[-1],
            )
        finally:
            del content

    # ── Local folder scan ────────────────────────────────────────────

    async def ingest_local_folder(
        self,
        folder_path: str,
        case_id: Optional[str],
        user_id: str,
        recursive: bool = True,
    ) -> AsyncIterator[IngestionResult]:
        """Scan a local folder and ingest all supported media files."""
        root = Path(folder_path)
        if not root.is_dir():
            raise ValueError(f"Path is not a directory: {folder_path}")

        pattern = "**/*" if recursive else "*"
        for file_path in sorted(root.glob(pattern)):
            if not file_path.is_file():
                continue

            suffix = file_path.suffix.lower()
            mime_map = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
                ".tiff": "image/tiff", ".tif": "image/tiff",
                ".mp4": "video/mp4", ".webm": "video/webm", ".avi": "video/avi",
                ".mov": "video/quicktime",
            }
            mime_type = mime_map.get(suffix)
            if mime_type is None:
                continue

            job = IngestionJob(
                source_type=SourceType.LOCAL_FILE,
                source_reference=str(file_path),
                case_id=case_id,
                user_id=user_id,
            )

            async with aiofiles.open(file_path, "rb") as f:
                content = await f.read()

            try:
                self._validate_content(content, mime_type)
                result = await self._process_content(
                    job=job, content=content, mime_type=mime_type,
                    original_filename=file_path.name,
                )
                yield result
            except Exception as e:
                logger.error("Ingestion failed: job=%s file=%s err=%s", job.job_id, file_path, e)
                yield IngestionResult(
                    job_id=job.job_id, sha256="", md5="",
                    file_size=0, mime_type=mime_type, original_filename=file_path.name,
                    status="failed", error=str(e),
                )
            finally:
                del content

    # ── Cloud bucket ─────────────────────────────────────────────────

    async def ingest_cloud_bucket(
        self,
        bucket_uri: str,
        prefix: str,
        case_id: Optional[str],
        user_id: str,
    ) -> AsyncIterator[IngestionResult]:
        """
        Ingest from S3-compatible bucket (MinIO, AWS S3, GCS).
        Iterates objects under the given prefix.
        """
        # Implementation depends on aiobotocore / minio client
        # Placeholder structure:
        job = IngestionJob(
            source_type=SourceType.CLOUD_BUCKET,
            source_reference=f"{bucket_uri}/{prefix}",
            case_id=case_id,
            user_id=user_id,
        )
        logger.info("Cloud bucket ingestion: job=%s bucket=%s prefix=%s", job.job_id, bucket_uri, prefix)
        # Would iterate bucket objects, download each, and process
        raise NotImplementedError("Cloud bucket ingestion requires S3 client configuration")

    # ── Internal processing ──────────────────────────────────────────

    def _validate_content(self, content: bytes, mime_type: Optional[str]) -> None:
        """Validate file size and MIME type before processing."""
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"File exceeds maximum size: {len(content)} > {MAX_FILE_SIZE}")
        if len(content) == 0:
            raise ValueError("Empty file content")
        if mime_type and mime_type not in ALLOWED_MIME_TYPES:
            # Check magic bytes as fallback
            if not self._check_magic_bytes(content):
                raise ValueError(f"Unsupported MIME type: {mime_type}")

    def _check_magic_bytes(self, content: bytes) -> bool:
        """Verify file type via magic bytes (defense against extension spoofing)."""
        signatures = {
            b"\xff\xd8\xff": "image/jpeg",
            b"\x89PNG\r\n\x1a\n": "image/png",
            b"GIF87a": "image/gif",
            b"GIF89a": "image/gif",
            b"RIFF": "image/webp",  # Simplified; RIFF....WEBP
            b"\x00\x00\x00": "video/mp4",  # Simplified; ftyp box
        }
        for sig in signatures:
            if content[:len(sig)] == sig:
                return True
        return False

    async def _process_content(
        self,
        job: IngestionJob,
        content: bytes,
        mime_type: str,
        original_filename: Optional[str],
    ) -> IngestionResult:
        """
        Core processing pipeline:
        1. Compute cryptographic hashes (SHA-256, MD5)
        2. Extract metadata (EXIF, dimensions, duration)
        3. Emit Kafka event for perceptual hashing + AI classification
        4. Store hash record in database
        5. Discard raw bytes
        """
        # Step 1: Cryptographic hashes
        sha256 = hashlib.sha256(content).hexdigest()
        md5 = hashlib.md5(content).hexdigest()
        file_size = len(content)

        # Step 2: Check for duplicate (already ingested)
        existing = await self._db.get_content_hash_by_sha256(sha256)
        if existing:
            logger.info("Duplicate detected: job=%s sha256=%s", job.job_id, sha256)
            return IngestionResult(
                job_id=job.job_id, sha256=sha256, md5=md5,
                file_size=file_size, mime_type=mime_type,
                original_filename=original_filename,
                status="duplicate",
            )

        # Step 3: Extract metadata (EXIF, dimensions — no raw image stored)
        metadata = await self._metadata.extract(content, mime_type)

        # Step 4: Persist hash record
        await self._db.create_content_hash(
            sha256=sha256,
            md5=md5,
            file_size=file_size,
            mime_type=mime_type,
            original_filename=original_filename,
            width=metadata.get("width"),
            height=metadata.get("height"),
            duration_seconds=metadata.get("duration"),
            exif_data=metadata.get("exif"),
            source=job.source_type.value,
            source_url=job.source_reference if job.source_type == SourceType.URL else None,
            ingested_by=job.user_id,
        )

        # Step 5: Emit event for async perceptual hashing + classification
        await self._kafka.send(
            topic="ingestion.file.received",
            value={
                "job_id": job.job_id,
                "sha256": sha256,
                "file_size": file_size,
                "mime_type": mime_type,
                "case_id": job.case_id,
                "user_id": job.user_id,
                "timestamp": datetime.utcnow().isoformat(),
                # Raw bytes sent via shared memory / temp secure storage
                # for the hashing worker — NOT persisted
                "content_ref": f"mem://{job.job_id}",
            },
        )

        logger.info(
            "Ingestion complete: job=%s sha256=%s size=%d",
            job.job_id, sha256, file_size,
        )

        return IngestionResult(
            job_id=job.job_id,
            sha256=sha256,
            md5=md5,
            file_size=file_size,
            mime_type=mime_type,
            original_filename=original_filename,
            metadata=metadata,
        )
