"""
Mary Poppins — OSINT Investigation Service
Modular open-source intelligence gathering with plugin architecture.
Correlates across surface, deep, and dark web sources.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("mp.osint")


class QueryType(str, Enum):
    EMAIL = "email"
    USERNAME = "username"
    PHONE = "phone"
    NAME = "name"
    DOMAIN = "domain"
    IP_ADDRESS = "ip_address"
    SOCIAL_PROFILE = "social_profile"


class SourceTier(str, Enum):
    SURFACE = "surface"
    DEEP = "deep"
    DARK = "dark"


@dataclass
class OsintFinding:
    """A single OSINT finding from a module."""
    module_name: str
    source_tier: SourceTier
    finding_type: str  # profile_found, breach_detected, domain_info, etc.
    data: dict[str, Any]
    source_url: Optional[str] = None
    confidence: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class OsintQueryResult:
    """Aggregated results from all modules for a single query."""
    query_id: str
    query_type: QueryType
    query_value: str
    findings: list[OsintFinding] = field(default_factory=list)
    total_modules_queried: int = 0
    modules_succeeded: int = 0
    modules_failed: int = 0
    elapsed_ms: int = 0
    queried_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def has_results(self) -> bool:
        return len(self.findings) > 0


# ──────────────────────────────────────────────────────────────────────
# Module plugin interface
# ──────────────────────────────────────────────────────────────────────

class OsintModule(ABC):
    """Base class for all OSINT modules."""

    name: str = "base"
    supported_query_types: list[QueryType] = []
    source_tier: SourceTier = SourceTier.SURFACE
    rate_limit_per_minute: int = 30

    @abstractmethod
    async def query(self, query_type: QueryType, value: str) -> list[OsintFinding]:
        """Execute the OSINT query and return findings."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the module's external dependencies are available."""
        ...


# ──────────────────────────────────────────────────────────────────────
# Built-in modules
# ──────────────────────────────────────────────────────────────────────

class EmailLookupModule(OsintModule):
    """Email OSINT: breach databases, WHOIS, DNS, social profiles."""

    name = "email_lookup"
    supported_query_types = [QueryType.EMAIL]
    source_tier = SourceTier.SURFACE

    def __init__(self, hibp_api_key: Optional[str] = None):
        self._hibp_key = hibp_api_key

    async def query(self, query_type: QueryType, value: str) -> list[OsintFinding]:
        findings = []

        # Breach check (Have I Been Pwned)
        if self._hibp_key:
            breach_data = await self._check_breaches(value)
            if breach_data:
                findings.append(OsintFinding(
                    module_name=self.name,
                    source_tier=self.source_tier,
                    finding_type="breach_detected",
                    data={"breaches": breach_data, "email": value},
                    confidence=0.95,
                ))

        # DNS / MX verification
        domain = value.split("@")[-1]
        mx_data = await self._check_mx_records(domain)
        findings.append(OsintFinding(
            module_name=self.name,
            source_tier=self.source_tier,
            finding_type="email_domain_info",
            data={"domain": domain, "mx_records": mx_data, "email": value},
            confidence=0.9,
        ))

        # Gravatar / public profile check
        gravatar = await self._check_gravatar(value)
        if gravatar:
            findings.append(OsintFinding(
                module_name=self.name,
                source_tier=self.source_tier,
                finding_type="public_profile",
                data={"service": "gravatar", "profile_data": gravatar},
                confidence=0.85,
            ))

        return findings

    async def health_check(self) -> bool:
        return True

    async def _check_breaches(self, email: str) -> Optional[list[dict]]:
        """Query HIBP API for breach data."""
        # Implementation: aiohttp call to HIBP API
        # Returns list of breach names, dates, data types
        return None  # Stub — requires API integration

    async def _check_mx_records(self, domain: str) -> list[str]:
        """Resolve MX records for the email domain."""
        import aiodns
        resolver = aiodns.DNSResolver()
        try:
            records = await resolver.query(domain, "MX")
            return [r.host for r in records]
        except Exception:
            return []

    async def _check_gravatar(self, email: str) -> Optional[dict]:
        """Check Gravatar for public profile."""
        email_hash = hashlib.md5(email.lower().strip().encode()).hexdigest()
        # Would fetch: https://www.gravatar.com/{hash}.json
        return None  # Stub


class UsernameSearchModule(OsintModule):
    """Username enumeration across hundreds of platforms."""

    name = "username_search"
    supported_query_types = [QueryType.USERNAME]
    source_tier = SourceTier.SURFACE

    # Major platforms to check (subset — full list would be 300+)
    PLATFORMS = [
        {"name": "GitHub", "url_template": "https://github.com/{}", "check": "status_code"},
        {"name": "Twitter/X", "url_template": "https://x.com/{}", "check": "status_code"},
        {"name": "Reddit", "url_template": "https://reddit.com/user/{}", "check": "status_code"},
        {"name": "Instagram", "url_template": "https://instagram.com/{}", "check": "status_code"},
        {"name": "Telegram", "url_template": "https://t.me/{}", "check": "status_code"},
        {"name": "TikTok", "url_template": "https://tiktok.com/@{}", "check": "status_code"},
        {"name": "LinkedIn", "url_template": "https://linkedin.com/in/{}", "check": "status_code"},
        {"name": "YouTube", "url_template": "https://youtube.com/@{}", "check": "status_code"},
        {"name": "Steam", "url_template": "https://steamcommunity.com/id/{}", "check": "status_code"},
        {"name": "Keybase", "url_template": "https://keybase.io/{}", "check": "status_code"},
    ]

    async def query(self, query_type: QueryType, value: str) -> list[OsintFinding]:
        """Check username existence across platforms (concurrent)."""
        import aiohttp

        findings = []
        semaphore = asyncio.Semaphore(10)

        async def check_platform(platform: dict) -> Optional[OsintFinding]:
            url = platform["url_template"].format(value)
            async with semaphore:
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10),
                                                allow_redirects=False) as resp:
                            if resp.status == 200:
                                return OsintFinding(
                                    module_name=self.name,
                                    source_tier=self.source_tier,
                                    finding_type="username_found",
                                    data={
                                        "platform": platform["name"],
                                        "username": value,
                                        "profile_url": url,
                                    },
                                    source_url=url,
                                    confidence=0.8,
                                )
                except Exception:
                    pass
            return None

        tasks = [check_platform(p) for p in self.PLATFORMS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, OsintFinding):
                findings.append(r)

        return findings

    async def health_check(self) -> bool:
        return True


class PhoneLookupModule(OsintModule):
    """Phone number OSINT: carrier info, caller ID, social lookups."""

    name = "phone_lookup"
    supported_query_types = [QueryType.PHONE]
    source_tier = SourceTier.SURFACE

    async def query(self, query_type: QueryType, value: str) -> list[OsintFinding]:
        findings = []

        # Phone number parsing and validation
        parsed = self._parse_phone(value)
        if parsed:
            findings.append(OsintFinding(
                module_name=self.name,
                source_tier=self.source_tier,
                finding_type="phone_info",
                data=parsed,
                confidence=0.9,
            ))

        return findings

    def _parse_phone(self, number: str) -> Optional[dict]:
        """Parse and validate phone number using phonenumbers lib."""
        try:
            import phonenumbers
            parsed = phonenumbers.parse(number, None)
            if phonenumbers.is_valid_number(parsed):
                return {
                    "e164": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
                    "country_code": parsed.country_code,
                    "national_number": str(parsed.national_number),
                    "number_type": str(phonenumbers.number_type(parsed)),
                    "carrier": phonenumbers.carrier.name_for_number(parsed, "en"),
                    "region": phonenumbers.geocoder.description_for_number(parsed, "en"),
                    "is_valid": True,
                }
        except Exception:
            pass
        return None

    async def health_check(self) -> bool:
        return True


class DomainIntelModule(OsintModule):
    """Domain OSINT: WHOIS, DNS, subdomains, certificates."""

    name = "domain_intel"
    supported_query_types = [QueryType.DOMAIN]
    source_tier = SourceTier.SURFACE

    async def query(self, query_type: QueryType, value: str) -> list[OsintFinding]:
        findings = []

        # DNS records
        dns_data = await self._resolve_dns(value)
        if dns_data:
            findings.append(OsintFinding(
                module_name=self.name,
                source_tier=self.source_tier,
                finding_type="dns_records",
                data={"domain": value, "records": dns_data},
                confidence=0.95,
            ))

        # WHOIS
        whois_data = await self._whois_lookup(value)
        if whois_data:
            findings.append(OsintFinding(
                module_name=self.name,
                source_tier=self.source_tier,
                finding_type="whois_info",
                data={"domain": value, "whois": whois_data},
                confidence=0.9,
            ))

        return findings

    async def _resolve_dns(self, domain: str) -> dict:
        """Resolve A, AAAA, MX, NS, TXT, CNAME records."""
        import aiodns
        resolver = aiodns.DNSResolver()
        records = {}
        for rtype in ["A", "AAAA", "MX", "NS", "TXT", "CNAME"]:
            try:
                result = await resolver.query(domain, rtype)
                records[rtype] = [str(r) for r in result] if result else []
            except Exception:
                records[rtype] = []
        return records

    async def _whois_lookup(self, domain: str) -> Optional[dict]:
        """WHOIS lookup for domain registration info."""
        # Would use asyncwhois or whoisit library
        return None  # Stub

    async def health_check(self) -> bool:
        return True


# ──────────────────────────────────────────────────────────────────────
# OSINT orchestrator
# ──────────────────────────────────────────────────────────────────────

class OsintService:
    """
    Orchestrates OSINT queries across all registered modules.
    Handles rate limiting, timeout management, and result aggregation.
    """

    def __init__(self, settings, audit_logger):
        self._settings = settings
        self._audit = audit_logger
        self._modules: dict[str, OsintModule] = {}
        self._rate_limiters: dict[str, asyncio.Semaphore] = {}

    def register_module(self, module: OsintModule) -> None:
        """Register an OSINT module."""
        self._modules[module.name] = module
        self._rate_limiters[module.name] = asyncio.Semaphore(module.rate_limit_per_minute)
        logger.info("OSINT module registered: %s (types=%s)", module.name, module.supported_query_types)

    async def search(
        self,
        query_type: QueryType,
        value: str,
        user_id: str,
        case_id: Optional[str] = None,
        modules: Optional[list[str]] = None,
    ) -> OsintQueryResult:
        """
        Execute an OSINT query across all applicable modules.
        Returns aggregated findings.
        """
        import uuid

        query_id = str(uuid.uuid4())
        start_time = time.monotonic()

        # Audit log the query
        await self._audit.log(
            action="osint.query",
            user_id=user_id,
            resource_type="osint_query",
            resource_id=query_id,
            details={
                "query_type": query_type.value,
                "query_value_hash": hashlib.sha256(value.encode()).hexdigest(),
                "case_id": case_id,
            },
        )

        # Select applicable modules
        applicable = []
        for name, module in self._modules.items():
            if modules and name not in modules:
                continue
            if query_type in module.supported_query_types:
                if name in self._settings.enabled_modules:
                    applicable.append(module)

        # Execute all modules concurrently with rate limiting
        async def run_module(mod: OsintModule) -> tuple[str, list[OsintFinding], bool]:
            async with self._rate_limiters[mod.name]:
                try:
                    findings = await asyncio.wait_for(
                        mod.query(query_type, value),
                        timeout=self._settings.query_timeout_seconds,
                    )
                    return mod.name, findings, True
                except asyncio.TimeoutError:
                    logger.warning("OSINT module timeout: %s", mod.name)
                    return mod.name, [], False
                except Exception as e:
                    logger.error("OSINT module error: %s — %s", mod.name, e)
                    return mod.name, [], False

        tasks = [run_module(m) for m in applicable]
        results = await asyncio.gather(*tasks)

        all_findings = []
        succeeded = 0
        failed = 0
        for module_name, findings, success in results:
            if success:
                succeeded += 1
                all_findings.extend(findings)
            else:
                failed += 1

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        return OsintQueryResult(
            query_id=query_id,
            query_type=query_type,
            query_value=value,
            findings=all_findings,
            total_modules_queried=len(applicable),
            modules_succeeded=succeeded,
            modules_failed=failed,
            elapsed_ms=elapsed_ms,
        )

    async def get_module_health(self) -> dict[str, bool]:
        """Check health of all registered modules."""
        health = {}
        for name, module in self._modules.items():
            try:
                health[name] = await module.health_check()
            except Exception:
                health[name] = False
        return health
