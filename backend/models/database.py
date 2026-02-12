"""
Mary Poppins — SQLAlchemy ORM Models
Core relational schema for PostgreSQL.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ──────────────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    INVESTIGATOR = "investigator"
    AUDITOR = "auditor"
    READONLY = "readonly"


class CaseStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PENDING_REVIEW = "pending_review"
    CLOSED = "closed"
    ARCHIVED = "archived"


class CasePriority(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ContentClassification(str, enum.Enum):
    SAFE = "safe"
    SUGGESTIVE = "suggestive"
    NSFW = "nsfw"
    NSFL = "nsfl"
    CSAM_SUSPECT = "csam_suspect"
    CSAM_CONFIRMED = "csam_confirmed"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class EntityType(str, enum.Enum):
    PERSON = "person"
    EMAIL = "email"
    PHONE = "phone"
    USERNAME = "username"
    IP_ADDRESS = "ip_address"
    DOMAIN = "domain"
    CRYPTO_WALLET = "crypto_wallet"
    CONTENT_HASH = "content_hash"
    FORUM_POST = "forum_post"
    ONION_SERVICE = "onion_service"


class DataSourceType(str, enum.Enum):
    LOCAL_UPLOAD = "local_upload"
    URL_FETCH = "url_fetch"
    CLOUD_BUCKET = "cloud_bucket"
    CRAWLER = "crawler"
    OSINT_MODULE = "osint_module"
    DARKWEB_CRAWLER = "darkweb_crawler"
    MANUAL_ENTRY = "manual_entry"
    API_IMPORT = "api_import"


class GroomingRiskLevel(str, enum.Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ──────────────────────────────────────────────────────────────────────
# Association tables
# ──────────────────────────────────────────────────────────────────────

case_investigators = Table(
    "case_investigators",
    Base.metadata,
    Column("case_id", UUID(as_uuid=True), ForeignKey("cases.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True),
    Column("assigned_at", DateTime, server_default=func.now()),
)

case_entities = Table(
    "case_entities",
    Base.metadata,
    Column("case_id", UUID(as_uuid=True), ForeignKey("cases.id"), primary_key=True),
    Column("entity_id", UUID(as_uuid=True), ForeignKey("entities.id"), primary_key=True),
    Column("linked_at", DateTime, server_default=func.now()),
    Column("linked_by", UUID(as_uuid=True), ForeignKey("users.id")),
    Column("notes", Text, nullable=True),
)

entity_tags = Table(
    "entity_tags",
    Base.metadata,
    Column("entity_id", UUID(as_uuid=True), ForeignKey("entities.id"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("tags.id"), primary_key=True),
)


# ──────────────────────────────────────────────────────────────────────
# Core models
# ──────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keycloak_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.READONLY)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    clearance_level: Mapped[int] = mapped_column(Integer, default=1)  # 1-5
    department: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    cases = relationship("Case", secondary=case_investigators, back_populates="investigators")
    audit_logs = relationship("AuditLog", back_populates="user")


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(Enum(CaseStatus), default=CaseStatus.OPEN)
    priority: Mapped[CasePriority] = mapped_column(Enum(CasePriority), default=CasePriority.MEDIUM)
    classification_level: Mapped[int] = mapped_column(Integer, default=1)
    warrant_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    warrant_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    legal_authority: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    investigators = relationship("User", secondary=case_investigators, back_populates="cases")
    entities = relationship("Entity", secondary=case_entities, back_populates="cases")
    alerts = relationship("Alert", back_populates="case")
    notes = relationship("CaseNote", back_populates="case")
    evidence_items = relationship("EvidenceItem", back_populates="case")

    __table_args__ = (
        Index("idx_case_status", "status"),
        Index("idx_case_priority", "priority"),
        Index("idx_case_created", "created_at"),
    )


class Entity(Base):
    """Universal entity model — any investigative node."""
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[EntityType] = mapped_column(Enum(EntityType), index=True)
    value: Mapped[str] = mapped_column(String(2000), index=True)
    display_label: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    first_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    source: Mapped[DataSourceType] = mapped_column(Enum(DataSourceType))
    source_reference: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cases = relationship("Case", secondary=case_entities, back_populates="entities")
    tags = relationship("Tag", secondary=entity_tags, back_populates="entities")

    __table_args__ = (
        Index("idx_entity_type_value", "entity_type", "value"),
        Index("idx_entity_risk", "risk_score"),
    )


class ContentHash(Base):
    """Perceptual and cryptographic hashes for media content."""
    __tablename__ = "content_hashes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    md5: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    phash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    pdq_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    photodna_hash: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(100))
    original_filename: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exif_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    classification: Mapped[ContentClassification] = mapped_column(
        Enum(ContentClassification), default=ContentClassification.SAFE
    )
    nsfw_score: Mapped[float] = mapped_column(Float, default=0.0)
    csam_score: Mapped[float] = mapped_column(Float, default=0.0)
    age_estimation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    known_database_match: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_database: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source: Mapped[DataSourceType] = mapped_column(Enum(DataSourceType))
    source_url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    ingested_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reported_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ingested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    ai_results = relationship("AIClassificationResult", back_populates="content_hash")

    __table_args__ = (
        Index("idx_hash_classification", "classification"),
        Index("idx_hash_csam_score", "csam_score"),
        Index("idx_hash_ingested", "ingested_at"),
    )


class AIClassificationResult(Base):
    """Detailed AI model output for a content hash."""
    __tablename__ = "ai_classification_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_hash_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_hashes.id"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(200))
    model_version: Mapped[str] = mapped_column(String(50))
    category: Mapped[str] = mapped_column(String(100))
    score: Mapped[float] = mapped_column(Float)
    raw_output: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    processing_time_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    content_hash = relationship("ContentHash", back_populates="ai_results")


class GroomingAnalysis(Base):
    """NLP grooming detection results for text content."""
    __tablename__ = "grooming_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_text_hash: Mapped[str] = mapped_column(String(64), index=True)
    source_type: Mapped[str] = mapped_column(String(50))  # chat, forum, comment, etc.
    source_reference: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    risk_level: Mapped[GroomingRiskLevel] = mapped_column(Enum(GroomingRiskLevel))
    risk_score: Mapped[float] = mapped_column(Float)
    stage_detected: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    indicators: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    flagged_phrases: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    model_name: Mapped[str] = mapped_column(String(200))
    model_version: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    case_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id"), nullable=True
    )
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    analyzed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    __table_args__ = (
        Index("idx_grooming_risk", "risk_level"),
        Index("idx_grooming_score", "risk_score"),
    )


class CryptoWallet(Base):
    """Cryptocurrency wallet with tracing metadata."""
    __tablename__ = "crypto_wallets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    address: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    blockchain: Mapped[str] = mapped_column(String(20))  # bitcoin, ethereum, etc.
    cluster_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    label: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    known_service: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_mixer: Mapped[bool] = mapped_column(Boolean, default=False)
    is_exchange: Mapped[bool] = mapped_column(Boolean, default=False)
    total_received: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_sent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    first_tx_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_tx_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    transactions_from = relationship(
        "CryptoTransaction", foreign_keys="CryptoTransaction.from_wallet_id", back_populates="from_wallet"
    )
    transactions_to = relationship(
        "CryptoTransaction", foreign_keys="CryptoTransaction.to_wallet_id", back_populates="to_wallet"
    )

    __table_args__ = (
        Index("idx_wallet_blockchain", "blockchain"),
        Index("idx_wallet_cluster", "cluster_id"),
    )


class CryptoTransaction(Base):
    __tablename__ = "crypto_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tx_hash: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    blockchain: Mapped[str] = mapped_column(String(20))
    from_wallet_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crypto_wallets.id"), nullable=True
    )
    to_wallet_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crypto_wallets.id"), nullable=True
    )
    amount: Mapped[float] = mapped_column(Float)
    amount_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    block_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    block_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_mixer_tx: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    from_wallet = relationship("CryptoWallet", foreign_keys=[from_wallet_id], back_populates="transactions_from")
    to_wallet = relationship("CryptoWallet", foreign_keys=[to_wallet_id], back_populates="transactions_to")


class OsintResult(Base):
    """Results from OSINT module queries."""
    __tablename__ = "osint_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_name: Mapped[str] = mapped_column(String(100), index=True)
    query_type: Mapped[str] = mapped_column(String(50))  # email, username, phone, etc.
    query_value: Mapped[str] = mapped_column(String(2000))
    result_data: Mapped[dict] = mapped_column(JSONB)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    source_url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    case_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id"), nullable=True
    )
    queried_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    queried_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class DarkwebSighting(Base):
    """Dark web content sightings (metadata only)."""
    __tablename__ = "darkweb_sightings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    onion_url: Mapped[str] = mapped_column(String(2000), index=True)
    page_title: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    content_type: Mapped[str] = mapped_column(String(100))
    keywords_found: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    classification: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    server_headers: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    linked_clearnet_domains: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    crawl_session_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[Text] = mapped_column(Text)
    source_service: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=True
    )
    case_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id"), nullable=True
    )
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    case = relationship("Case", back_populates="alerts")

    __table_args__ = (
        Index("idx_alert_severity_ack", "severity", "is_acknowledged"),
    )


class CaseNote(Base):
    __tablename__ = "case_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    is_privileged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    case = relationship("Case", back_populates="notes")


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    evidence_type: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    hash_sha256: Mapped[str] = mapped_column(String(64))
    storage_ref: Mapped[str] = mapped_column(String(500))  # MinIO object reference
    chain_of_custody: Mapped[dict] = mapped_column(JSONB, default=list)
    collected_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    collected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    case = relationship("Case", back_populates="evidence_items")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(7), default="#6B7280")
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    entities = relationship("Entity", secondary=entity_tags, back_populates="tags")


class AuditLog(Base):
    """Immutable, append-only audit trail with hash chain integrity."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    resource_type: Mapped[str] = mapped_column(String(100))
    resource_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    case_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id"), nullable=True
    )
    previous_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), unique=True)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("idx_audit_action_resource", "action", "resource_type"),
        Index("idx_audit_case", "case_id"),
    )


class IntegrationConfig(Base):
    """User-configured API integrations and OSINT data sources."""
    __tablename__ = "integration_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    category: Mapped[str] = mapped_column(String(50))  # osint, crypto, threat_intel, etc.
    provider: Mapped[str] = mapped_column(String(100))
    base_url: Mapped[str] = mapped_column(String(2000))
    auth_type: Mapped[str] = mapped_column(String(50))  # api_key, oauth2, basic, none
    auth_config_vault_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    rate_limit: Mapped[int] = mapped_column(Integer, default=60)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
