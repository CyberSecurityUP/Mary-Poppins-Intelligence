"""
Mary Poppins — Geolocation & Infrastructure Service
IP-to-location resolution, ASN mapping, and geographic intelligence.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("mp.geo")


@dataclass
class GeoLocation:
    ip_address: str
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None
    accuracy_radius_km: Optional[int] = None


@dataclass
class ASNInfo:
    ip_address: str
    asn: Optional[int] = None
    asn_org: Optional[str] = None
    network: Optional[str] = None
    isp: Optional[str] = None


@dataclass
class InfrastructureProfile:
    """Full infrastructure profile for an IP address."""
    ip_address: str
    geo: GeoLocation
    asn: ASNInfo
    is_tor_exit: bool = False
    is_vpn: bool = False
    is_proxy: bool = False
    is_datacenter: bool = False
    is_residential: bool = False
    reverse_dns: Optional[str] = None
    open_ports: list[int] = field(default_factory=list)
    ssl_certificates: list[dict[str, Any]] = field(default_factory=list)
    hosting_provider: Optional[str] = None
    abuse_contact: Optional[str] = None


@dataclass
class HeatmapPoint:
    latitude: float
    longitude: float
    weight: float = 1.0
    label: Optional[str] = None
    entity_type: Optional[str] = None
    count: int = 1


class GeolocationService:
    """
    IP geolocation and infrastructure analysis.
    Uses MaxMind GeoLite2 databases for offline resolution.
    """

    def __init__(self, settings):
        self._settings = settings
        self._city_reader = None
        self._asn_reader = None

    async def initialize(self):
        """Load MaxMind databases."""
        import geoip2.database
        self._city_reader = geoip2.database.Reader(self._settings.maxmind_db_path)
        self._asn_reader = geoip2.database.Reader(self._settings.maxmind_asn_path)
        logger.info("GeoIP databases loaded")

    async def lookup_ip(self, ip_address: str) -> GeoLocation:
        """Resolve IP to geographic location."""
        try:
            response = self._city_reader.city(ip_address)
            return GeoLocation(
                ip_address=ip_address,
                country_code=response.country.iso_code,
                country_name=response.country.name,
                region=response.subdivisions.most_specific.name if response.subdivisions else None,
                city=response.city.name,
                postal_code=response.postal.code,
                latitude=response.location.latitude,
                longitude=response.location.longitude,
                timezone=response.location.time_zone,
                accuracy_radius_km=response.location.accuracy_radius,
            )
        except Exception as e:
            logger.warning("GeoIP lookup failed for %s: %s", ip_address, e)
            return GeoLocation(ip_address=ip_address)

    async def lookup_asn(self, ip_address: str) -> ASNInfo:
        """Resolve IP to ASN information."""
        try:
            response = self._asn_reader.asn(ip_address)
            return ASNInfo(
                ip_address=ip_address,
                asn=response.autonomous_system_number,
                asn_org=response.autonomous_system_organization,
                network=str(response.network) if response.network else None,
            )
        except Exception as e:
            logger.warning("ASN lookup failed for %s: %s", ip_address, e)
            return ASNInfo(ip_address=ip_address)

    async def get_infrastructure_profile(self, ip_address: str) -> InfrastructureProfile:
        """Get complete infrastructure profile for an IP."""
        geo = await self.lookup_ip(ip_address)
        asn = await self.lookup_asn(ip_address)

        # Check Tor exit node list
        is_tor = await self._check_tor_exit(ip_address)

        # Reverse DNS
        rdns = await self._reverse_dns(ip_address)

        # Heuristic: datacenter detection based on ASN org names
        is_datacenter = self._detect_datacenter(asn.asn_org or "")

        return InfrastructureProfile(
            ip_address=ip_address,
            geo=geo,
            asn=asn,
            is_tor_exit=is_tor,
            is_datacenter=is_datacenter,
            is_residential=not is_datacenter and not is_tor,
            reverse_dns=rdns,
        )

    async def generate_heatmap_data(
        self,
        ip_addresses: list[str],
        entity_types: Optional[list[str]] = None,
    ) -> list[HeatmapPoint]:
        """Generate geographic heatmap data from a list of IPs."""
        points = []
        location_counts: dict[tuple[float, float], HeatmapPoint] = {}

        for ip in ip_addresses:
            geo = await self.lookup_ip(ip)
            if geo.latitude is not None and geo.longitude is not None:
                key = (round(geo.latitude, 2), round(geo.longitude, 2))
                if key in location_counts:
                    location_counts[key].count += 1
                    location_counts[key].weight += 1.0
                else:
                    location_counts[key] = HeatmapPoint(
                        latitude=geo.latitude,
                        longitude=geo.longitude,
                        weight=1.0,
                        label=f"{geo.city or 'Unknown'}, {geo.country_code or ''}",
                    )

        return list(location_counts.values())

    async def get_country_stats(self, ip_addresses: list[str]) -> dict[str, int]:
        """Aggregate IP addresses by country."""
        stats: dict[str, int] = {}
        for ip in ip_addresses:
            geo = await self.lookup_ip(ip)
            country = geo.country_code or "UNKNOWN"
            stats[country] = stats.get(country, 0) + 1
        return dict(sorted(stats.items(), key=lambda x: x[1], reverse=True))

    # ── Private helpers ──────────────────────────────────────────────

    async def _check_tor_exit(self, ip_address: str) -> bool:
        """Check if IP is a known Tor exit node."""
        # Would check against periodically updated Tor exit list
        # https://check.torproject.org/torbulkexitlist
        return False  # Stub

    async def _reverse_dns(self, ip_address: str) -> Optional[str]:
        """Perform reverse DNS lookup."""
        import socket
        try:
            hostname, _, _ = socket.gethostbyaddr(ip_address)
            return hostname
        except (socket.herror, socket.gaierror):
            return None

    def _detect_datacenter(self, asn_org: str) -> bool:
        """Heuristic detection of datacenter/hosting IPs."""
        datacenter_keywords = [
            "amazon", "aws", "google", "microsoft", "azure",
            "digitalocean", "linode", "vultr", "ovh", "hetzner",
            "cloudflare", "fastly", "akamai", "hosting", "server",
            "datacenter", "data center", "cloud",
        ]
        org_lower = asn_org.lower()
        return any(kw in org_lower for kw in datacenter_keywords)
