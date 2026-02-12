"""
Mary Poppins — Audit Middleware
Immutable, hash-chained audit logging for all platform actions.
Provides tamper-evident chain of custody for investigations.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("mp.audit")


# PII patterns to mask in audit logs
PII_PATTERNS = [
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL_MASKED]"),
    (re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"), "[PHONE_MASKED]"),
    (re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"), "[IP_PRESERVED]"),  # IPs are kept for audit
    (re.compile(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b"), "[BTC_ADDR_MASKED]"),
    (re.compile(r"\b0x[a-fA-F0-9]{40}\b"), "[ETH_ADDR_MASKED]"),
]


class AuditEntry:
    """A single immutable audit log entry with hash chain integrity."""

    def __init__(
        self,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        case_id: Optional[str] = None,
        previous_hash: str = "",
    ):
        self.timestamp = datetime.utcnow()
        self.user_id = user_id
        self.action = action
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.details = self._mask_pii(details) if details else None
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.case_id = case_id
        self.previous_hash = previous_hash
        self.entry_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        """Compute SHA-256 hash that chains to the previous entry."""
        payload = json.dumps({
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "case_id": self.case_id,
            "previous_hash": self.previous_hash,
        }, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()

    def _mask_pii(self, details: dict[str, Any]) -> dict[str, Any]:
        """Mask PII in audit log details to prevent data leakage."""
        masked = {}
        for key, value in details.items():
            if isinstance(value, str):
                masked_value = value
                for pattern, replacement in PII_PATTERNS:
                    masked_value = pattern.sub(replacement, masked_value)
                masked[key] = masked_value
            elif isinstance(value, dict):
                masked[key] = self._mask_pii(value)
            else:
                masked[key] = value
        return masked

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "case_id": self.case_id,
            "previous_hash": self.previous_hash,
            "entry_hash": self.entry_hash,
        }


class AuditLogger:
    """
    Append-only audit logger with hash chain integrity.
    Writes to PostgreSQL (primary) and Elasticsearch (search/analytics).
    """

    def __init__(self, db_session, es_client=None):
        self._db = db_session
        self._es = es_client
        self._last_hash = ""
        self._chain_initialized = False

    async def initialize(self):
        """Load the last audit entry hash to continue the chain."""
        last_entry = await self._db.get_last_audit_entry()
        if last_entry:
            self._last_hash = last_entry.entry_hash
        else:
            # Genesis entry
            self._last_hash = hashlib.sha256(b"MARY_POPPINS_AUDIT_GENESIS").hexdigest()
        self._chain_initialized = True

    async def log(
        self,
        action: str,
        user_id: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        case_id: Optional[str] = None,
    ) -> AuditEntry:
        """Create and persist a new audit entry."""
        if not self._chain_initialized:
            await self.initialize()

        entry = AuditEntry(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            case_id=case_id,
            previous_hash=self._last_hash,
        )

        # Persist to PostgreSQL (primary store)
        await self._db.insert_audit_entry(entry)

        # Index in Elasticsearch (for search and analytics)
        if self._es:
            await self._es.index(
                index="mp-audit-logs",
                body=entry.to_dict(),
            )

        self._last_hash = entry.entry_hash

        logger.info(
            "AUDIT: user=%s action=%s resource=%s/%s",
            user_id, action, resource_type, resource_id,
        )

        return entry

    async def verify_chain_integrity(
        self,
        start_id: Optional[int] = None,
        end_id: Optional[int] = None,
    ) -> dict:
        """
        Verify the integrity of the audit hash chain.
        Returns verification result with any broken links identified.
        """
        entries = await self._db.get_audit_entries_range(start_id, end_id)

        total = len(entries)
        verified = 0
        broken_links = []

        for i, entry in enumerate(entries):
            if i == 0:
                # First entry in range — can only verify its own hash
                recomputed = self._recompute_hash(entry)
                if recomputed != entry.entry_hash:
                    broken_links.append({
                        "entry_id": entry.id,
                        "type": "self_hash_mismatch",
                        "expected": entry.entry_hash,
                        "computed": recomputed,
                    })
                else:
                    verified += 1
                continue

            # Verify chain link: previous entry's hash should match
            prev_entry = entries[i - 1]
            if entry.previous_hash != prev_entry.entry_hash:
                broken_links.append({
                    "entry_id": entry.id,
                    "type": "chain_break",
                    "expected_previous": prev_entry.entry_hash,
                    "recorded_previous": entry.previous_hash,
                })
            else:
                # Verify self-hash
                recomputed = self._recompute_hash(entry)
                if recomputed == entry.entry_hash:
                    verified += 1
                else:
                    broken_links.append({
                        "entry_id": entry.id,
                        "type": "self_hash_mismatch",
                        "expected": entry.entry_hash,
                        "computed": recomputed,
                    })

        return {
            "total_entries": total,
            "verified": verified,
            "broken_links": len(broken_links),
            "is_intact": len(broken_links) == 0,
            "details": broken_links,
        }

    def _recompute_hash(self, entry) -> str:
        """Recompute an entry's hash for verification."""
        payload = json.dumps({
            "timestamp": entry.timestamp.isoformat(),
            "user_id": str(entry.user_id),
            "action": entry.action,
            "resource_type": entry.resource_type,
            "resource_id": entry.resource_id,
            "details": entry.details,
            "ip_address": str(entry.ip_address) if entry.ip_address else None,
            "case_id": str(entry.case_id) if entry.case_id else None,
            "previous_hash": entry.previous_hash,
        }, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()


class AuditMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that automatically logs all API requests.
    """

    def __init__(self, app, audit_logger: AuditLogger):
        super().__init__(app)
        self._audit = audit_logger

    # Paths excluded from audit logging
    EXCLUDED_PATHS = frozenset({
        "/health",
        "/ready",
        "/metrics",
        "/docs",
        "/openapi.json",
        "/redoc",
    })

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        # Skip excluded paths
        if request.url.path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # Extract user info from JWT (set by auth middleware)
        user_id = getattr(request.state, "user_id", "anonymous")
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")

        # Map HTTP method to action
        action = self._method_to_action(request.method, request.url.path)

        # Execute request
        response = await call_next(request)

        # Log the action (async, non-blocking)
        try:
            await self._audit.log(
                action=action,
                user_id=str(user_id),
                resource_type=self._extract_resource_type(request.url.path),
                resource_id=self._extract_resource_id(request.url.path),
                details={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "query_params": dict(request.query_params),
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception as e:
            logger.error("Audit logging failed: %s", e)

        return response

    def _method_to_action(self, method: str, path: str) -> str:
        resource = self._extract_resource_type(path)
        method_map = {
            "GET": f"{resource}.read",
            "POST": f"{resource}.create",
            "PUT": f"{resource}.update",
            "PATCH": f"{resource}.update",
            "DELETE": f"{resource}.delete",
        }
        return method_map.get(method, f"{resource}.{method.lower()}")

    def _extract_resource_type(self, path: str) -> str:
        parts = path.strip("/").split("/")
        # /api/v1/{resource}/... → resource
        if len(parts) >= 3 and parts[0] == "api":
            return parts[2]
        return parts[0] if parts else "unknown"

    def _extract_resource_id(self, path: str) -> Optional[str]:
        parts = path.strip("/").split("/")
        # /api/v1/{resource}/{id}/... → id
        if len(parts) >= 4 and parts[0] == "api":
            return parts[3]
        return None
