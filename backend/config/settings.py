"""
Mary Poppins — Platform Configuration
Centralized settings with environment-based overrides and Vault integration.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


# ---------------------------------------------------------------------------
# Core application settings
# ---------------------------------------------------------------------------

class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MP_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "Mary Poppins"
    version: str = "1.0.0"
    environment: Environment = Environment.DEVELOPMENT
    debug: bool = False
    log_level: LogLevel = LogLevel.INFO
    secret_key: SecretStr = Field(..., description="Application secret key")
    allowed_hosts: list[str] = ["localhost", "127.0.0.1"]
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4

    # --- Paths ---
    base_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = Path("/data/marypoppins")
    temp_dir: Path = Path("/tmp/marypoppins")


# ---------------------------------------------------------------------------
# Database connections
# ---------------------------------------------------------------------------

class PostgresSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_PG_")

    host: str = "localhost"
    port: int = 5432
    database: str = "marypoppins"
    user: str = "mp_app"
    password: SecretStr = Field(...)
    pool_min: int = 5
    pool_max: int = 20
    ssl_mode: str = "require"

    @property
    def dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.user}:{self.password.get_secret_value()}"
            f"@{self.host}:{self.port}/{self.database}"
            f"?ssl={self.ssl_mode}"
        )


class Neo4jSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_NEO4J_")

    uri: str = "bolt://localhost:7687"
    user: str = "neo4j"
    password: SecretStr = Field(...)
    database: str = "marypoppins"
    max_connection_pool_size: int = 50
    encrypted: bool = True


class ElasticsearchSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_ES_")

    hosts: list[str] = ["https://localhost:9200"]
    user: str = "elastic"
    password: SecretStr = Field(...)
    index_prefix: str = "mp"
    verify_certs: bool = True
    ca_certs: Optional[str] = None


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_REDIS_")

    host: str = "localhost"
    port: int = 6379
    password: SecretStr = Field(default=SecretStr(""))
    db: int = 0
    ssl: bool = False
    sentinel_hosts: Optional[list[str]] = None
    sentinel_master: str = "marypoppins"

    @property
    def url(self) -> str:
        scheme = "rediss" if self.ssl else "redis"
        pwd = self.password.get_secret_value()
        auth = f":{pwd}@" if pwd else ""
        return f"{scheme}://{auth}{self.host}:{self.port}/{self.db}"


# ---------------------------------------------------------------------------
# Message bus / queue
# ---------------------------------------------------------------------------

class KafkaSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_KAFKA_")

    bootstrap_servers: list[str] = ["localhost:9092"]
    security_protocol: str = "SASL_SSL"
    sasl_mechanism: str = "SCRAM-SHA-512"
    sasl_username: str = "mp_producer"
    sasl_password: SecretStr = Field(...)
    consumer_group: str = "mp-services"


# ---------------------------------------------------------------------------
# AI / ML classification
# ---------------------------------------------------------------------------

class ClassifierSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_CLASSIFIER_")

    nsfw_model_path: str = "/models/nsfw_detector_v3.onnx"
    age_model_path: str = "/models/age_estimator_v2.onnx"
    scene_model_path: str = "/models/scene_classifier_v1.onnx"
    device: str = "cuda"  # "cuda" | "cpu"
    batch_size: int = 32
    confidence_threshold: float = 0.7
    csam_alert_threshold: float = 0.85
    nsfw_categories: list[str] = [
        "explicit_sexual",
        "suggestive",
        "violence_graphic",
        "violence_mild",
        "drugs",
        "safe",
    ]

    # Public model integrations
    yahoo_nsfw_model_path: str = "/models/yahoo_open_nsfw.onnx"
    yahoo_nsfw_enabled: bool = True
    yahoo_nsfw_weight: float = 0.30

    nudenet_model_path: str = "/models/nudenet_v3.onnx"
    nudenet_enabled: bool = True
    nudenet_weight: float = 0.25

    clip_safety_model_path: str = "/models/clip_safety.onnx"
    clip_safety_enabled: bool = False
    clip_safety_weight: float = 0.15

    # NSFL detection
    nsfl_model_path: str = "/models/nsfl_detector_v1.onnx"
    nsfl_enabled: bool = True
    nsfl_alert_threshold: float = 0.80

    # Ensemble configuration
    ensemble_method: str = "weighted_average"  # "weighted_average" | "majority_vote" | "max_confidence"
    low_agreement_threshold: float = 0.6  # Below this, flag for manual review

    # Video analysis
    video_analysis_enabled: bool = True
    video_max_frames: int = 20
    video_frame_interval: float = 5.0


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

class HashingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_HASH_")

    enable_phash: bool = True
    enable_pdq: bool = True
    enable_photodna: bool = True
    photodna_api_endpoint: str = ""
    photodna_api_key: SecretStr = Field(default=SecretStr(""))
    hamming_distance_threshold: int = 10  # perceptual hash match threshold
    hash_db_path: str = "/data/hashdb"


# ---------------------------------------------------------------------------
# OSINT
# ---------------------------------------------------------------------------

class OsintSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_OSINT_")

    max_concurrent_queries: int = 10
    query_timeout_seconds: int = 30
    rate_limit_per_module: int = 60  # requests per minute
    enabled_modules: list[str] = [
        "email_lookup",
        "username_search",
        "phone_lookup",
        "domain_whois",
        "social_media",
        "breach_check",
        "dns_records",
        "ip_geolocation",
    ]


# ---------------------------------------------------------------------------
# Cryptocurrency tracing
# ---------------------------------------------------------------------------

class CryptoSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_CRYPTO_")

    bitcoin_rpc_url: str = "http://localhost:8332"
    bitcoin_rpc_user: str = "mp_btc"
    bitcoin_rpc_password: SecretStr = Field(default=SecretStr(""))
    ethereum_rpc_url: str = "http://localhost:8545"
    max_trace_depth: int = 10
    cluster_threshold: float = 0.8
    known_services_db: str = "/data/crypto/known_services.db"
    mixer_detection_enabled: bool = True


# ---------------------------------------------------------------------------
# Dark web
# ---------------------------------------------------------------------------

class DarkWebSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_DARKWEB_")

    tor_socks_proxy: str = "socks5h://localhost:9050"
    tor_control_port: int = 9051
    tor_control_password: SecretStr = Field(default=SecretStr(""))
    max_concurrent_crawlers: int = 5
    crawl_depth: int = 3
    crawl_interval_minutes: int = 60
    monitored_forums: list[str] = []
    screenshot_enabled: bool = False  # Disabled — metadata only


# ---------------------------------------------------------------------------
# Geolocation & infrastructure
# ---------------------------------------------------------------------------

class GeoSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_GEO_")

    maxmind_db_path: str = "/data/geo/GeoLite2-City.mmdb"
    maxmind_asn_path: str = "/data/geo/GeoLite2-ASN.mmdb"
    ip_api_enabled: bool = True


# ---------------------------------------------------------------------------
# LLM integrations
# ---------------------------------------------------------------------------

class LLMSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_LLM_")

    default_provider: str = "anthropic"  # anthropic, openai, deepseek, openrouter
    anthropic_api_key: SecretStr = Field(default=SecretStr(""))
    anthropic_model: str = "claude-sonnet-4-5-20250929"
    openai_api_key: SecretStr = Field(default=SecretStr(""))
    openai_model: str = "gpt-4o"
    deepseek_api_key: SecretStr = Field(default=SecretStr(""))
    deepseek_model: str = "deepseek-chat"
    openrouter_api_key: SecretStr = Field(default=SecretStr(""))
    openrouter_model: str = "auto"
    default_temperature: float = 0.7
    default_max_tokens: int = 4096
    content_analysis_provider: str = "anthropic"
    osint_agent_provider: str = "anthropic"


class AIorNotSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_AIORNOT_")

    api_key: SecretStr = Field(default=SecretStr(""))
    base_url: str = "https://api.aiornot.com/v1"
    timeout_seconds: int = 30
    enabled: bool = False


# ---------------------------------------------------------------------------
# Ethical & legal safeguards
# ---------------------------------------------------------------------------

class EthicalSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_ETHICAL_")

    require_warrant_for_osint: bool = False
    require_warrant_for_darkweb: bool = True
    max_data_retention_days: int = 365
    auto_purge_unlinked_data: bool = True
    audit_log_immutable: bool = True
    dual_authorization_for_export: bool = True
    image_display_blocked: bool = True  # NEVER set to False
    pii_masking_in_logs: bool = True


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------

class NotificationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_NOTIFY_")

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: SecretStr = Field(default=SecretStr(""))
    smtp_tls: bool = True
    slack_webhook_url: str = ""
    teams_webhook_url: str = ""
    enable_email: bool = True
    enable_slack: bool = False
    enable_teams: bool = False


# ---------------------------------------------------------------------------
# Vault integration
# ---------------------------------------------------------------------------

class VaultSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MP_VAULT_")

    enabled: bool = True
    url: str = "https://vault.internal:8200"
    token: SecretStr = Field(default=SecretStr(""))
    mount_path: str = "secret/marypoppins"
    transit_key: str = "mp-field-encryption"


# ---------------------------------------------------------------------------
# Composite config
# ---------------------------------------------------------------------------

class Settings:
    """Aggregated configuration singleton."""

    def __init__(self) -> None:
        self.app = AppSettings()
        self.postgres = PostgresSettings()
        self.neo4j = Neo4jSettings()
        self.elasticsearch = ElasticsearchSettings()
        self.redis = RedisSettings()
        self.kafka = KafkaSettings()
        self.classifier = ClassifierSettings()
        self.hashing = HashingSettings()
        self.osint = OsintSettings()
        self.crypto = CryptoSettings()
        self.darkweb = DarkWebSettings()
        self.geo = GeoSettings()
        self.ethical = EthicalSettings()
        self.notification = NotificationSettings()
        self.vault = VaultSettings()
        self.llm = LLMSettings()
        self.aiornot = AIorNotSettings()


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
