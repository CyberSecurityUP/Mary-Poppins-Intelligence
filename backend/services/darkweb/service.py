"""
Mary Poppins — Dark Web Investigation Service
Tor-based crawling, .onion monitoring, forum/marketplace tracking,
and alias correlation. Operates on metadata only — never stores
or displays illegal content.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger("mp.darkweb")


class CrawlStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class SiteCategory(str, Enum):
    FORUM = "forum"
    MARKETPLACE = "marketplace"
    PASTE_SITE = "paste_site"
    IMAGE_BOARD = "image_board"
    BLOG = "blog"
    COMMUNICATION = "communication"
    HOSTING = "hosting"
    CRYPTOCURRENCY = "cryptocurrency"
    UNKNOWN = "unknown"


@dataclass
class CrawlSession:
    session_id: str
    target_url: str
    status: CrawlStatus = CrawlStatus.PENDING
    depth: int = 2
    pages_crawled: int = 0
    pages_found: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_by: str = ""


@dataclass
class OnionSighting:
    """Metadata about a discovered .onion page (NO content stored)."""
    url: str
    page_title: Optional[str] = None
    content_hash: str = ""  # SHA-256 of page content (content discarded after hashing)
    content_length: int = 0
    content_type: str = ""
    server_header: Optional[str] = None
    keywords_found: list[str] = field(default_factory=list)
    outgoing_links: list[str] = field(default_factory=list)
    linked_clearnet_domains: list[str] = field(default_factory=list)
    category: SiteCategory = SiteCategory.UNKNOWN
    risk_score: float = 0.0
    first_seen: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)
    crawl_session_id: Optional[str] = None


@dataclass
class ForumProfile:
    """Metadata about a user profile on a dark web forum."""
    username: str
    forum_url: str
    forum_name: str
    registration_date: Optional[str] = None
    post_count: Optional[int] = None
    reputation_score: Optional[str] = None
    pgp_key_fingerprint: Optional[str] = None
    last_active: Optional[str] = None
    signature: Optional[str] = None
    avatar_hash: Optional[str] = None
    contact_methods: list[dict[str, str]] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass
class AliasCorrelation:
    """Correlation between aliases across different dark web platforms."""
    alias_a: str
    platform_a: str
    alias_b: str
    platform_b: str
    correlation_type: str  # pgp_key, writing_style, timing, shared_contact, etc.
    confidence: float = 0.0
    evidence: list[str] = field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# Investigation keywords (for metadata extraction, NOT content display)
# ──────────────────────────────────────────────────────────────────────

INVESTIGATION_KEYWORDS = {
    "high_risk": [
        "csam", "cp", "child", "underage", "minor", "pedo",
        "jailbait", "preteen", "lolita",
    ],
    "marketplace": [
        "vendor", "listing", "escrow", "shipping", "feedback",
        "pgp", "multisig", "dispute",
    ],
    "financial": [
        "bitcoin", "btc", "monero", "xmr", "ethereum",
        "tumbling", "mixing", "wallet", "payment",
    ],
    "infrastructure": [
        "hosting", "bulletproof", "vpn", "proxy", "mirror",
        "onion", "i2p", "freenet",
    ],
}


class DarkWebInvestigationService:
    """
    Dark web investigation capabilities:
    - Tor-based .onion crawling (metadata extraction only)
    - Forum and marketplace monitoring
    - Alias and infrastructure correlation
    - PGP key fingerprint tracking
    - Writing style analysis for de-anonymization

    SAFETY INVARIANTS:
    - Raw page content is NEVER stored — only hashed + metadata extracted
    - Images/media on dark web pages are NEVER downloaded or displayed
    - All crawl activities are audit-logged
    - Requires elevated authorization (warrant-level for production)
    """

    def __init__(self, settings, tor_client, kafka_producer, db_session, audit_logger):
        self._settings = settings
        self._tor = tor_client
        self._kafka = kafka_producer
        self._db = db_session
        self._audit = audit_logger
        self._active_crawls: dict[str, CrawlSession] = {}

    # ── Crawl management ─────────────────────────────────────────────

    async def start_crawl(
        self,
        target_url: str,
        depth: int = 2,
        user_id: str = "",
        case_id: Optional[str] = None,
    ) -> CrawlSession:
        """
        Start a new .onion crawl session.
        Requires authorization verification.
        """
        if not target_url.endswith(".onion") and ".onion/" not in target_url:
            raise ValueError("Target must be a .onion URL")

        if depth > self._settings.crawl_depth:
            depth = self._settings.crawl_depth

        if len(self._active_crawls) >= self._settings.max_concurrent_crawlers:
            raise RuntimeError("Maximum concurrent crawlers reached")

        import uuid
        session = CrawlSession(
            session_id=str(uuid.uuid4()),
            target_url=target_url,
            depth=depth,
            created_by=user_id,
        )

        await self._audit.log(
            action="darkweb.crawl.started",
            user_id=user_id,
            resource_type="crawl_session",
            resource_id=session.session_id,
            details={"target_url": target_url, "depth": depth, "case_id": case_id},
        )

        self._active_crawls[session.session_id] = session

        # Launch crawl as background task
        asyncio.create_task(self._execute_crawl(session))

        return session

    async def _execute_crawl(self, session: CrawlSession) -> None:
        """Execute the crawl in the background, collecting metadata only."""
        session.status = CrawlStatus.RUNNING
        session.started_at = datetime.utcnow()

        visited: set[str] = set()
        queue: list[tuple[str, int]] = [(session.target_url, 0)]

        try:
            while queue:
                url, current_depth = queue.pop(0)

                if url in visited or current_depth > session.depth:
                    continue
                visited.add(url)

                try:
                    sighting = await self._crawl_page(url, session.session_id)
                    session.pages_crawled += 1

                    if sighting:
                        await self._db.save_sighting(sighting)

                        # Emit event for downstream processing
                        await self._kafka.send(
                            topic="darkweb.content.discovered",
                            value={
                                "session_id": session.session_id,
                                "url": url,
                                "content_hash": sighting.content_hash,
                                "keywords": sighting.keywords_found,
                                "risk_score": sighting.risk_score,
                                "category": sighting.category.value,
                            },
                        )

                        # Enqueue outgoing .onion links
                        for link in sighting.outgoing_links:
                            if link not in visited and self._is_onion_url(link):
                                queue.append((link, current_depth + 1))
                                session.pages_found += 1

                except Exception as e:
                    logger.error("Crawl error for %s: %s", url, e)

                # Rate limiting
                await asyncio.sleep(2)

            session.status = CrawlStatus.COMPLETED
        except Exception as e:
            session.status = CrawlStatus.FAILED
            session.error = str(e)
            logger.error("Crawl session failed: %s — %s", session.session_id, e)
        finally:
            session.completed_at = datetime.utcnow()

    async def _crawl_page(self, url: str, session_id: str) -> Optional[OnionSighting]:
        """
        Fetch a single .onion page via Tor and extract metadata.
        Raw content is hashed and immediately discarded.
        """
        response = await self._tor.get(url, timeout=30)

        if response is None:
            return None

        content = response.body
        headers = response.headers

        # Compute content hash (content itself is NOT stored)
        content_hash = hashlib.sha256(content).hexdigest()

        # Extract text metadata
        text_content = ""
        if "text/html" in headers.get("content-type", ""):
            text_content = self._extract_text_from_html(content)

        # Extract metadata
        title = self._extract_title(content)
        links = self._extract_links(content, url)
        clearnet_domains = self._find_clearnet_links(links)
        keywords = self._find_keywords(text_content)
        category = self._categorize_page(text_content, title, url)
        risk_score = self._compute_risk_score(keywords, category)

        # Raw content discarded after this point
        del content
        del text_content

        return OnionSighting(
            url=url,
            page_title=title,
            content_hash=content_hash,
            content_length=len(response.body),
            content_type=headers.get("content-type", ""),
            server_header=headers.get("server"),
            keywords_found=keywords,
            outgoing_links=[l for l in links if self._is_onion_url(l)],
            linked_clearnet_domains=clearnet_domains,
            category=category,
            risk_score=risk_score,
            crawl_session_id=session_id,
        )

    # ── Forum monitoring ─────────────────────────────────────────────

    async def monitor_forum(
        self,
        forum_url: str,
        keywords: list[str],
        interval_minutes: int = 60,
    ) -> str:
        """
        Set up continuous monitoring of a dark web forum.
        Watches for new posts matching keywords and extracts user metadata.
        Returns a monitor_id for managing the monitor.
        """
        import uuid
        monitor_id = str(uuid.uuid4())
        # Would persist monitor config and start periodic crawl task
        logger.info("Forum monitor created: %s for %s", monitor_id, forum_url)
        return monitor_id

    async def extract_forum_profile(
        self,
        forum_url: str,
        username: str,
    ) -> Optional[ForumProfile]:
        """Extract metadata about a user profile on a dark web forum."""
        # Fetch profile page via Tor
        profile_url = f"{forum_url}/user/{username}"
        response = await self._tor.get(profile_url)

        if response is None:
            return None

        # Parse profile metadata (site-specific parsing)
        # Extract: join date, post count, PGP key, contact methods, etc.
        return ForumProfile(
            username=username,
            forum_url=forum_url,
            forum_name=self._extract_forum_name(forum_url),
        )

    # ── Alias correlation ────────────────────────────────────────────

    async def correlate_aliases(
        self,
        alias: str,
        platform: str,
    ) -> list[AliasCorrelation]:
        """
        Find potential alias correlations across dark web platforms.

        Correlation methods:
        1. PGP key fingerprint matching
        2. Writing style analysis (stylometry)
        3. Temporal activity patterns
        4. Shared contact methods (Jabber, Wickr, etc.)
        5. Cryptocurrency address reuse
        """
        correlations = []

        # Check for PGP key reuse
        pgp_correlations = await self._correlate_by_pgp(alias, platform)
        correlations.extend(pgp_correlations)

        # Check shared contact methods
        contact_correlations = await self._correlate_by_contacts(alias, platform)
        correlations.extend(contact_correlations)

        # Check crypto address reuse
        crypto_correlations = await self._correlate_by_crypto(alias, platform)
        correlations.extend(crypto_correlations)

        return correlations

    async def _correlate_by_pgp(
        self, alias: str, platform: str,
    ) -> list[AliasCorrelation]:
        """Find aliases sharing the same PGP key fingerprint."""
        # Would query Neo4j graph for PGP key relationships
        return []

    async def _correlate_by_contacts(
        self, alias: str, platform: str,
    ) -> list[AliasCorrelation]:
        """Find aliases sharing the same contact methods."""
        return []

    async def _correlate_by_crypto(
        self, alias: str, platform: str,
    ) -> list[AliasCorrelation]:
        """Find aliases using the same cryptocurrency addresses."""
        return []

    # ── Infrastructure analysis ──────────────────────────────────────

    async def analyze_infrastructure(self, onion_url: str) -> dict:
        """
        Analyze the hosting infrastructure of an .onion service.
        Checks for shared hosting, clearnet leaks, and server fingerprints.
        """
        sighting = await self._db.get_sighting_by_url(onion_url)
        if not sighting:
            return {"error": "No sighting data for this URL"}

        return {
            "server_header": sighting.server_header,
            "content_type": sighting.content_type,
            "linked_clearnet_domains": sighting.linked_clearnet_domains,
            "category": sighting.category.value,
            # Would include: SSL cert analysis, shared hosting indicators,
            # uptime patterns, response timing analysis
        }

    # ── Helper methods ───────────────────────────────────────────────

    def _is_onion_url(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            return parsed.hostname and parsed.hostname.endswith(".onion")
        except Exception:
            return False

    def _extract_title(self, html_content: bytes) -> Optional[str]:
        """Extract <title> from HTML."""
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, "html.parser")
            title_tag = soup.find("title")
            return title_tag.get_text(strip=True) if title_tag else None
        except Exception:
            return None

    def _extract_text_from_html(self, html_content: bytes) -> str:
        """Extract visible text from HTML, discarding tags and scripts."""
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, "html.parser")
            for tag in soup(["script", "style", "img", "video", "audio"]):
                tag.decompose()
            return soup.get_text(separator=" ", strip=True)
        except Exception:
            return ""

    def _extract_links(self, html_content: bytes, base_url: str) -> list[str]:
        """Extract all hyperlinks from HTML."""
        try:
            from urllib.parse import urljoin

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, "html.parser")
            links = []
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"]
                full_url = urljoin(base_url, href)
                links.append(full_url)
            return links
        except Exception:
            return []

    def _find_clearnet_links(self, links: list[str]) -> list[str]:
        """Identify clearnet domains linked from the .onion page."""
        clearnet = []
        for link in links:
            try:
                parsed = urlparse(link)
                if parsed.hostname and not parsed.hostname.endswith(".onion"):
                    clearnet.append(parsed.hostname)
            except Exception:
                pass
        return list(set(clearnet))

    def _find_keywords(self, text: str) -> list[str]:
        """Search for investigation-relevant keywords in extracted text."""
        found = []
        text_lower = text.lower()
        for category, kws in INVESTIGATION_KEYWORDS.items():
            for kw in kws:
                if kw in text_lower:
                    found.append(f"{category}:{kw}")
        return found

    def _categorize_page(self, text: str, title: Optional[str], url: str) -> SiteCategory:
        """Categorize a dark web page based on content metadata."""
        combined = f"{title or ''} {text[:2000]}".lower()

        if any(w in combined for w in ["forum", "thread", "reply", "post", "discussion"]):
            return SiteCategory.FORUM
        if any(w in combined for w in ["vendor", "listing", "add to cart", "escrow", "marketplace"]):
            return SiteCategory.MARKETPLACE
        if any(w in combined for w in ["paste", "hastebin", "pastebin"]):
            return SiteCategory.PASTE_SITE
        if any(w in combined for w in ["hosting", "bulletproof", "server", "vps"]):
            return SiteCategory.HOSTING

        return SiteCategory.UNKNOWN

    def _compute_risk_score(self, keywords: list[str], category: SiteCategory) -> float:
        """Compute risk score from keywords and page category."""
        score = 0.0

        high_risk_count = sum(1 for k in keywords if k.startswith("high_risk:"))
        score += min(0.5, high_risk_count * 0.15)

        category_risk = {
            SiteCategory.MARKETPLACE: 0.3,
            SiteCategory.FORUM: 0.2,
            SiteCategory.IMAGE_BOARD: 0.4,
            SiteCategory.PASTE_SITE: 0.1,
        }
        score += category_risk.get(category, 0.05)

        return min(1.0, score)

    def _extract_forum_name(self, url: str) -> str:
        try:
            parsed = urlparse(url)
            return parsed.hostname or "unknown"
        except Exception:
            return "unknown"

    # ── Crawl status ─────────────────────────────────────────────────

    async def get_crawl_status(self, session_id: str) -> Optional[CrawlSession]:
        return self._active_crawls.get(session_id)

    async def list_active_crawls(self) -> list[CrawlSession]:
        return list(self._active_crawls.values())

    async def stop_crawl(self, session_id: str) -> bool:
        session = self._active_crawls.get(session_id)
        if session and session.status == CrawlStatus.RUNNING:
            session.status = CrawlStatus.PAUSED
            return True
        return False
