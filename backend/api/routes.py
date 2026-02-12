"""
Mary Poppins -- FastAPI Route Definitions
=========================================
Comprehensive API router for the digital intelligence platform.

All endpoints are organized under ``/api/v1`` and grouped by domain.
Each sub-router carries its own Pydantic request/response schemas,
dependency-injected authentication, rate limiting, and audit logging.
"""

from __future__ import annotations

import enum
import hashlib
import uuid
from datetime import datetime, date
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Header,
    HTTPException,
    Path,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator


# ============================================================================
# Shared Pydantic Schemas
# ============================================================================


class PaginationParams(BaseModel):
    """Query parameters for paginated list endpoints."""
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    page_size: int = Field(default=25, ge=1, le=200, description="Items per page")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel):
    """Envelope for any paginated collection."""
    model_config = ConfigDict(from_attributes=True)

    items: list[Any]
    total: int = Field(ge=0, description="Total matching items across all pages")
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    pages: int = Field(ge=0, description="Total pages available")


class ErrorDetail(BaseModel):
    """Standard error payload returned on 4xx / 5xx responses."""
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable description")
    details: Optional[dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class SuccessMessage(BaseModel):
    message: str
    id: Optional[str] = None


class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: Optional[datetime] = None


# ============================================================================
# Enums (mirroring database enums for the API layer)
# ============================================================================


class UserRoleEnum(str, enum.Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    INVESTIGATOR = "investigator"
    AUDITOR = "auditor"
    READONLY = "readonly"


class CaseStatusEnum(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PENDING_REVIEW = "pending_review"
    CLOSED = "closed"
    ARCHIVED = "archived"


class CasePriorityEnum(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ContentClassificationEnum(str, enum.Enum):
    SAFE = "safe"
    SUGGESTIVE = "suggestive"
    NSFW = "nsfw"
    NSFL = "nsfl"
    CSAM_SUSPECT = "csam_suspect"
    CSAM_CONFIRMED = "csam_confirmed"


class AlertSeverityEnum(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class GroomingRiskLevelEnum(str, enum.Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EntityTypeEnum(str, enum.Enum):
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


class BlockchainEnum(str, enum.Enum):
    BITCOIN = "bitcoin"
    ETHEREUM = "ethereum"
    MONERO = "monero"
    LITECOIN = "litecoin"
    BITCOIN_CASH = "bitcoin_cash"


class OsintQueryType(str, enum.Enum):
    EMAIL = "email"
    USERNAME = "username"
    PHONE = "phone"
    DOMAIN = "domain"
    IP = "ip"
    NAME = "name"


class CrawlerState(str, enum.Enum):
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    FAILED = "failed"
    COMPLETED = "completed"


# ============================================================================
# Dependency Stubs
# ============================================================================
#
# These are thin dependency-injection callables.  The concrete
# implementations live in ``backend.middleware`` and
# ``backend.services`` and are wired at application startup; the
# signatures here define the contract for every route handler.
# ============================================================================


class CurrentUser(BaseModel):
    """Represents the authenticated user extracted from JWT claims."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: UserRoleEnum
    clearance_level: int = Field(ge=1, le=5)
    mfa_verified: bool = False


async def get_current_user(
    request: Request,
    authorization: str = Header(..., description="Bearer <JWT>"),
) -> CurrentUser:
    """Validate the JWT from the Authorization header and return the
    authenticated user.  Raises ``401`` on invalid or expired tokens.

    Concrete implementation delegates to Keycloak token introspection
    via ``backend.services.auth``.
    """
    # -- Placeholder: in production this calls the auth service. --
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not implemented -- wire up Keycloak token validation",
    )


async def require_role(*allowed_roles: UserRoleEnum):
    """Factory that returns a dependency enforcing role-based access."""

    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not permitted for this action",
            )
        return user

    return _check


def require_roles(*allowed_roles: UserRoleEnum):
    """Return a dependency that rejects users whose role is not in
    *allowed_roles*.
    """

    async def _dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not authorised for this resource",
            )
        return user

    return Depends(_dependency)


async def rate_limiter(request: Request) -> None:
    """Sliding-window rate limiter backed by Redis.

    The real implementation lives in ``backend.middleware.rate_limit``.
    It inspects ``request.state.user`` and applies per-user and
    per-endpoint quotas.  Returns ``429 Too Many Requests`` when the
    window is exceeded.
    """
    pass  # wired at startup


async def audit_log(request: Request) -> None:
    """Middleware dependency that records every mutating action into the
    immutable ``audit_logs`` table with hash-chain integrity.

    Populated fields: user_id, action (HTTP method + path), resource_type,
    resource_id, IP address, user-agent, and a SHA-256 chain hash.
    """
    pass  # wired at startup


# Convenience bundles of common dependencies
_auth_deps = [Depends(get_current_user), Depends(rate_limiter)]
_write_deps = [Depends(get_current_user), Depends(rate_limiter), Depends(audit_log)]


# ============================================================================
# 1. AUTH  --  /api/v1/auth
# ============================================================================

auth_router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# -- Schemas ----------------------------------------------------------------

class LoginRequest(BaseModel):
    """Credentials for username/password login."""
    email: EmailStr
    password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Seconds until access_token expiry")


class RefreshRequest(BaseModel):
    refresh_token: str


class MFAVerifyRequest(BaseModel):
    """Time-based one-time password from an authenticator app."""
    totp_code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFASetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_code_base64: str


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=12)


# -- Endpoints --------------------------------------------------------------

@auth_router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    responses={401: {"model": ErrorResponse}},
    summary="Authenticate with email and password",
)
async def login(body: LoginRequest):
    """Authenticate a user against Keycloak and return a JWT pair.

    On success the response includes an ``access_token`` (short-lived)
    and a ``refresh_token``.  If the account has MFA enabled, the
    ``access_token`` will carry an ``mfa_pending`` flag; the caller
    must subsequently hit ``/mfa/verify`` before accessing protected
    resources.
    """
    ...


@auth_router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=_auth_deps,
    summary="Invalidate the current session",
)
async def logout(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Revoke the current access and refresh tokens server-side."""
    ...


@auth_router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={401: {"model": ErrorResponse}},
    summary="Refresh an expired access token",
)
async def refresh_token(body: RefreshRequest):
    """Exchange a valid refresh token for a new access/refresh pair."""
    ...


@auth_router.post(
    "/mfa/verify",
    response_model=TokenResponse,
    responses={401: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    summary="Complete MFA challenge",
)
async def mfa_verify(body: MFAVerifyRequest):
    """Verify a TOTP code after initial login on an MFA-enabled account.

    Returns a fully-authorised token pair on success.
    """
    ...


@auth_router.post(
    "/mfa/setup",
    response_model=MFASetupResponse,
    dependencies=_auth_deps,
    summary="Begin MFA enrolment",
)
async def mfa_setup(user: CurrentUser = Depends(get_current_user)):
    """Generate a TOTP secret and provisioning URI for MFA enrolment.

    The caller should display the QR code and then confirm via
    ``/mfa/verify``.
    """
    ...


@auth_router.post(
    "/password/change",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=_write_deps,
    summary="Change own password",
)
async def change_password(
    body: PasswordChangeRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Change the authenticated user's password.  Requires the current
    password for verification.
    """
    ...


# ============================================================================
# 2. CASES  --  /api/v1/cases
# ============================================================================

cases_router = APIRouter(
    prefix="/api/v1/cases",
    tags=["Cases"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class CaseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    priority: CasePriorityEnum = CasePriorityEnum.MEDIUM
    classification_level: int = Field(default=1, ge=1, le=5)
    warrant_reference: Optional[str] = None
    warrant_expires: Optional[datetime] = None
    legal_authority: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    status: Optional[CaseStatusEnum] = None
    priority: Optional[CasePriorityEnum] = None
    classification_level: Optional[int] = Field(default=None, ge=1, le=5)
    warrant_reference: Optional[str] = None
    warrant_expires: Optional[datetime] = None
    legal_authority: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None


class InvestigatorAssignment(BaseModel):
    user_ids: list[uuid.UUID] = Field(..., min_length=1)


class CaseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_number: str
    title: str
    status: CaseStatusEnum
    priority: CasePriorityEnum
    classification_level: int
    investigator_count: int = 0
    evidence_count: int = 0
    alert_count: int = 0
    created_at: datetime
    updated_at: datetime


class CaseDetail(CaseSummary):
    description: Optional[str] = None
    warrant_reference: Optional[str] = None
    warrant_expires: Optional[datetime] = None
    legal_authority: Optional[str] = None
    created_by: uuid.UUID
    closed_at: Optional[datetime] = None
    investigators: list[uuid.UUID] = []
    metadata_json: Optional[dict[str, Any]] = None


class EvidenceItemCreate(BaseModel):
    evidence_type: str = Field(..., max_length=100)
    description: str
    hash_sha256: str = Field(..., min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    storage_ref: str = Field(..., max_length=500)
    metadata_json: Optional[dict[str, Any]] = None


class EvidenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    evidence_type: str
    description: str
    hash_sha256: str
    storage_ref: str
    chain_of_custody: list[dict[str, Any]]
    collected_by: uuid.UUID
    collected_at: datetime
    metadata_json: Optional[dict[str, Any]] = None


class CaseNoteCreate(BaseModel):
    content: str = Field(..., min_length=1)
    is_privileged: bool = False


class CaseNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    author_id: uuid.UUID
    content: str
    is_privileged: bool
    created_at: datetime
    updated_at: datetime


# -- Endpoints --------------------------------------------------------------

@cases_router.get(
    "",
    response_model=PaginatedResponse,
    summary="List cases with filtering and pagination",
)
async def list_cases(
    status: Optional[CaseStatusEnum] = Query(default=None, description="Filter by status"),
    priority: Optional[CasePriorityEnum] = Query(default=None, description="Filter by priority"),
    search: Optional[str] = Query(default=None, max_length=200, description="Full-text search on title/description"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return a paginated list of cases visible to the current user.

    Results are filtered by the user's clearance level; classification
    levels above the user's clearance are excluded automatically.
    """
    ...


@cases_router.post(
    "",
    response_model=CaseDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Create a new case",
)
async def create_case(
    body: CaseCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Create a new investigation case.

    A unique ``case_number`` is generated automatically.  The creating
    user is added as the first investigator.
    """
    ...


@cases_router.get(
    "/{case_id}",
    response_model=CaseDetail,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single case",
)
async def get_case(
    case_id: uuid.UUID = Path(..., description="Case UUID"),
    user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full detail for a single case, including investigator
    list and metadata.
    """
    ...


@cases_router.patch(
    "/{case_id}",
    response_model=CaseDetail,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Update case fields",
)
async def update_case(
    body: CaseUpdate,
    case_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Partially update a case.  Only supplied fields are changed."""
    ...


@cases_router.delete(
    "/{case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Archive (soft-delete) a case",
)
async def delete_case(
    case_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN, UserRoleEnum.INVESTIGATOR)
    ),
):
    """Soft-delete a case by setting its status to ``archived``.

    Only admins and lead investigators may archive cases.  Archived
    cases remain in the database and audit trail.
    """
    ...


@cases_router.post(
    "/{case_id}/investigators",
    response_model=SuccessMessage,
    dependencies=[Depends(audit_log)],
    summary="Assign investigators to a case",
)
async def assign_investigators(
    body: InvestigatorAssignment,
    case_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Add one or more users as investigators on this case."""
    ...


@cases_router.delete(
    "/{case_id}/investigators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(audit_log)],
    summary="Remove an investigator from a case",
)
async def remove_investigator(
    case_id: uuid.UUID = Path(...),
    user_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Remove a single investigator assignment from a case."""
    ...


# Evidence sub-resource

@cases_router.post(
    "/{case_id}/evidence",
    response_model=EvidenceItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Add an evidence item to a case",
)
async def add_evidence(
    body: EvidenceItemCreate,
    case_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Register a new evidence item with its SHA-256 hash and
    chain-of-custody initialization.
    """
    ...


@cases_router.get(
    "/{case_id}/evidence",
    response_model=PaginatedResponse,
    summary="List evidence items for a case",
)
async def list_evidence(
    case_id: uuid.UUID = Path(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated evidence items attached to the specified case."""
    ...


@cases_router.get(
    "/{case_id}/evidence/{evidence_id}",
    response_model=EvidenceItemResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single evidence item",
)
async def get_evidence_item(
    case_id: uuid.UUID = Path(...),
    evidence_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return full detail for one evidence item including its chain of custody."""
    ...


# Case notes sub-resource

@cases_router.post(
    "/{case_id}/notes",
    response_model=CaseNoteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Add a note to a case",
)
async def add_case_note(
    body: CaseNoteCreate,
    case_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Append an investigator note to the case.

    Privileged notes are only visible to users whose clearance level
    meets or exceeds the case's classification level.
    """
    ...


@cases_router.get(
    "/{case_id}/notes",
    response_model=PaginatedResponse,
    summary="List notes for a case",
)
async def list_case_notes(
    case_id: uuid.UUID = Path(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated case notes, excluding privileged notes when the
    user's clearance is insufficient.
    """
    ...


# ============================================================================
# 3. INGEST  --  /api/v1/ingest
# ============================================================================

ingest_router = APIRouter(
    prefix="/api/v1/ingest",
    tags=["Ingestion"],
    dependencies=_write_deps,
)


# -- Schemas ----------------------------------------------------------------

class IngestURLRequest(BaseModel):
    url: HttpUrl
    case_id: Optional[uuid.UUID] = None
    tags: list[str] = Field(default_factory=list)
    priority: CasePriorityEnum = CasePriorityEnum.MEDIUM


class IngestCrawlerRequest(BaseModel):
    """Start a new crawler job."""
    seed_urls: list[HttpUrl] = Field(..., min_length=1, max_length=50)
    max_depth: int = Field(default=2, ge=1, le=10)
    max_pages: int = Field(default=100, ge=1, le=10000)
    allowed_domains: list[str] = Field(default_factory=list)
    case_id: Optional[uuid.UUID] = None
    tags: list[str] = Field(default_factory=list)


class BatchImportRequest(BaseModel):
    """Import records from an external system."""
    source_system: str = Field(..., max_length=100)
    records: list[dict[str, Any]] = Field(..., min_length=1, max_length=5000)
    case_id: Optional[uuid.UUID] = None
    deduplicate: bool = True


class IngestJobResponse(BaseModel):
    job_id: uuid.UUID
    status: str = "queued"
    created_at: datetime
    estimated_duration_seconds: Optional[int] = None


class IngestStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    progress_percent: float = Field(ge=0.0, le=100.0)
    items_processed: int = 0
    items_total: int = 0
    errors: list[str] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# -- Endpoints --------------------------------------------------------------

@ingest_router.post(
    "/upload",
    response_model=IngestJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload files for ingestion",
)
async def upload_files(
    files: list[UploadFile] = File(..., description="One or more files to ingest"),
    case_id: Optional[uuid.UUID] = Query(default=None),
    tags: Optional[str] = Query(default=None, description="Comma-separated tags"),
    user: CurrentUser = Depends(get_current_user),
):
    """Accept file uploads for hashing, classification, and indexing.

    Files are written to the staging area and an asynchronous
    processing pipeline is triggered.  The response contains a
    ``job_id`` that can be polled via ``GET /ingest/status/{job_id}``.

    Supported formats: images (JPEG, PNG, GIF, WEBP, BMP, TIFF),
    video (MP4, AVI, MKV, MOV), documents (PDF, DOCX), archives
    (ZIP, 7z, TAR).

    Maximum file size per upload: 500 MB.  Maximum 50 files per request.
    """
    ...


@ingest_router.post(
    "/url",
    response_model=IngestJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a URL for content retrieval and ingestion",
)
async def submit_url(
    body: IngestURLRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Fetch content from the given URL, hash it, and run it through
    the classification pipeline.
    """
    ...


@ingest_router.post(
    "/crawler",
    response_model=IngestJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Launch a web crawler for bulk ingestion",
)
async def start_crawler(
    body: IngestCrawlerRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Start a crawler job that will follow links up to ``max_depth``
    and ingest discovered content.  Crawled pages are deduplicated by
    content hash.
    """
    ...


@ingest_router.post(
    "/batch",
    response_model=IngestJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Batch import records from an external system",
)
async def batch_import(
    body: BatchImportRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Import up to 5 000 records in a single batch.  Each record is
    validated, deduplicated (when enabled), and inserted into the
    appropriate tables.
    """
    ...


@ingest_router.get(
    "/status/{job_id}",
    response_model=IngestStatusResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Check ingestion job progress",
)
async def ingest_status(
    job_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Poll for the current status and progress of an ingestion job."""
    ...


@ingest_router.post(
    "/status/{job_id}/cancel",
    response_model=SuccessMessage,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    summary="Cancel a running ingestion job",
)
async def cancel_ingest_job(
    job_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Request cancellation of an in-progress ingestion job.

    Jobs that have already completed or failed cannot be cancelled
    (409 Conflict).
    """
    ...


# ============================================================================
# 4. HASHES  --  /api/v1/hashes
# ============================================================================

hashes_router = APIRouter(
    prefix="/api/v1/hashes",
    tags=["Hash Database"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class HashQueryRequest(BaseModel):
    hash_value: str = Field(..., min_length=16, max_length=128)
    hash_type: str = Field(
        default="sha256",
        pattern=r"^(sha256|md5|phash|pdq|photodna)$",
        description="Type of hash being queried",
    )


class HashSubmitRequest(BaseModel):
    sha256: str = Field(..., min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    md5: Optional[str] = Field(default=None, min_length=32, max_length=32)
    phash: Optional[str] = Field(default=None, max_length=64)
    pdq_hash: Optional[str] = Field(default=None, max_length=64)
    file_size_bytes: int = Field(..., gt=0)
    mime_type: str = Field(..., max_length=100)
    original_filename: Optional[str] = None
    source: str = Field(default="local_upload", max_length=50)
    case_id: Optional[uuid.UUID] = None


class SimilarHashRequest(BaseModel):
    """Search for perceptually similar images via hamming distance."""
    hash_value: str = Field(..., min_length=16, max_length=64)
    hash_type: str = Field(
        default="phash",
        pattern=r"^(phash|pdq)$",
        description="Perceptual hash algorithm",
    )
    max_distance: int = Field(default=10, ge=0, le=64, description="Maximum hamming distance")
    limit: int = Field(default=50, ge=1, le=500)


class HashMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sha256: str
    md5: Optional[str] = None
    phash: Optional[str] = None
    pdq_hash: Optional[str] = None
    file_size_bytes: int
    mime_type: str
    classification: ContentClassificationEnum
    known_database_match: bool
    matched_database: Optional[str] = None
    ingested_at: datetime


class SimilarHashMatch(HashMatchResponse):
    hamming_distance: int = Field(ge=0, description="Hamming distance from the query hash")


class HashStatsResponse(BaseModel):
    total_hashes: int
    known_matches: int
    classification_breakdown: dict[str, int]
    hashes_last_24h: int
    hashes_last_7d: int


class BulkHashSubmit(BaseModel):
    hashes: list[HashSubmitRequest] = Field(..., min_length=1, max_length=1000)


class BulkHashResult(BaseModel):
    submitted: int
    duplicates_skipped: int
    errors: list[dict[str, str]] = Field(default_factory=list)


# -- Endpoints --------------------------------------------------------------

@hashes_router.post(
    "/query",
    response_model=Optional[HashMatchResponse],
    responses={404: {"model": ErrorResponse}},
    summary="Look up a single hash in the database",
)
async def query_hash(
    body: HashQueryRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Search for an exact match of the given hash value.  Returns
    ``404`` if the hash is not in the database.
    """
    ...


@hashes_router.post(
    "/submit",
    response_model=HashMatchResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Submit a new hash to the database",
)
async def submit_hash(
    body: HashSubmitRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Insert a new content hash record.  If the SHA-256 already exists
    the existing record is returned with ``200 OK`` instead.
    """
    ...


@hashes_router.post(
    "/submit/bulk",
    response_model=BulkHashResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Bulk-submit up to 1 000 hashes",
)
async def bulk_submit_hashes(
    body: BulkHashSubmit,
    user: CurrentUser = Depends(get_current_user),
):
    """Bulk-insert hash records.  Duplicates are silently skipped and
    counted in the response.
    """
    ...


@hashes_router.post(
    "/similar",
    response_model=list[SimilarHashMatch],
    summary="Find perceptually similar hashes (hamming distance)",
)
async def search_similar_hashes(
    body: SimilarHashRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Search for hashes within the specified hamming distance of the
    query hash.  Only perceptual hashes (pHash, PDQ) are supported.

    Results are sorted by ascending hamming distance.
    """
    ...


@hashes_router.get(
    "/stats",
    response_model=HashStatsResponse,
    summary="Aggregate hash database statistics",
)
async def hash_stats(user: CurrentUser = Depends(get_current_user)):
    """Return summary statistics for the hash database."""
    ...


@hashes_router.get(
    "/{hash_id}",
    response_model=HashMatchResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get hash record by ID",
)
async def get_hash_by_id(
    hash_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Retrieve a single hash record by its database UUID."""
    ...


# ============================================================================
# 5. CLASSIFY  --  /api/v1/classify
# ============================================================================

classify_router = APIRouter(
    prefix="/api/v1/classify",
    tags=["AI Classification"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class ClassifyTriggerRequest(BaseModel):
    """Trigger classification on one or more content hashes."""
    content_hash_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=100)
    models: list[str] = Field(
        default=["nsfw_detector", "age_estimator", "scene_classifier"],
        description="Which ML models to run",
    )
    priority: CasePriorityEnum = CasePriorityEnum.MEDIUM


class ClassifyJobResponse(BaseModel):
    job_id: uuid.UUID
    items_queued: int
    estimated_seconds: Optional[int] = None


class ClassificationResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content_hash_id: uuid.UUID
    model_name: str
    model_version: str
    category: str
    score: float
    raw_output: Optional[dict[str, Any]] = None
    processing_time_ms: int
    created_at: datetime


class ReviewQueueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_hash_id: uuid.UUID
    sha256: str
    current_classification: ContentClassificationEnum
    ai_scores: dict[str, float]
    requires_human_review: bool = True
    flagged_at: datetime


class ReviewDecision(BaseModel):
    content_hash_id: uuid.UUID
    classification: ContentClassificationEnum
    reviewer_notes: Optional[str] = None


# -- Endpoints --------------------------------------------------------------

@classify_router.post(
    "/trigger",
    response_model=ClassifyJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(audit_log)],
    summary="Trigger AI classification on content hashes",
)
async def trigger_classification(
    body: ClassifyTriggerRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Enqueue selected content hashes for AI classification.

    Returns immediately with a ``job_id``; results are available via
    ``GET /classify/results/{content_hash_id}`` once processing
    completes.
    """
    ...


@classify_router.get(
    "/results/{content_hash_id}",
    response_model=list[ClassificationResultResponse],
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve classification results for a content hash",
)
async def get_classification_results(
    content_hash_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return all AI classification results for the specified content
    hash, one entry per model run.
    """
    ...


@classify_router.get(
    "/review-queue",
    response_model=PaginatedResponse,
    summary="List items pending human review",
)
async def review_queue(
    min_score: float = Query(default=0.5, ge=0.0, le=1.0, description="Minimum AI score to include"),
    classification: Optional[ContentClassificationEnum] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated items that exceeded confidence thresholds and
    require a human analyst's decision.

    Note: images are **never** displayed directly.  The review
    interface shows only metadata, hash values, and AI scores.
    """
    ...


@classify_router.post(
    "/review-queue/decide",
    response_model=SuccessMessage,
    dependencies=[Depends(audit_log)],
    summary="Submit a human review decision",
)
async def submit_review_decision(
    body: ReviewDecision,
    user: CurrentUser = Depends(get_current_user),
):
    """Record a human reviewer's final classification for a content hash.

    This updates the authoritative ``classification`` field and removes
    the item from the review queue.
    """
    ...


@classify_router.get(
    "/models",
    response_model=list[dict[str, Any]],
    summary="List available classification models",
)
async def list_classification_models(
    user: CurrentUser = Depends(get_current_user),
):
    """Return metadata about all deployed classification models
    including name, version, supported categories, and performance
    statistics.
    """
    ...


# ============================================================================
# 6. GROOMING  --  /api/v1/grooming
# ============================================================================

grooming_router = APIRouter(
    prefix="/api/v1/grooming",
    tags=["Grooming Detection"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class GroomingAnalysisRequest(BaseModel):
    """Submit text for grooming-pattern NLP analysis."""
    text: str = Field(..., min_length=10, max_length=100_000)
    source_type: str = Field(default="chat", max_length=50, description="chat, forum, comment, dm, etc.")
    source_reference: Optional[str] = Field(default=None, max_length=2000)
    language: str = Field(default="en", max_length=10)
    case_id: Optional[uuid.UUID] = None
    entity_id: Optional[uuid.UUID] = None


class GroomingBatchRequest(BaseModel):
    """Submit multiple texts for batch analysis."""
    items: list[GroomingAnalysisRequest] = Field(..., min_length=1, max_length=200)


class GroomingResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_text_hash: str
    source_type: str
    risk_level: GroomingRiskLevelEnum
    risk_score: float = Field(ge=0.0, le=1.0)
    stage_detected: Optional[str] = Field(
        default=None,
        description="Grooming stage: trust_building, isolation, desensitization, "
                    "sexual_content, maintenance",
    )
    indicators: Optional[dict[str, Any]] = None
    flagged_phrases: Optional[list[str]] = None
    language: str
    model_name: str
    model_version: str
    analyzed_at: datetime


class GroomingBatchJobResponse(BaseModel):
    job_id: uuid.UUID
    items_queued: int
    estimated_seconds: Optional[int] = None


class GroomingStatsResponse(BaseModel):
    total_analyzed: int
    risk_breakdown: dict[str, int]
    stage_breakdown: dict[str, int]
    analyses_last_24h: int
    average_score: float


# -- Endpoints --------------------------------------------------------------

@grooming_router.post(
    "/analyze",
    response_model=GroomingResultResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(audit_log)],
    summary="Analyze a single text for grooming patterns",
)
async def analyze_grooming(
    body: GroomingAnalysisRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Run the grooming-detection NLP pipeline on the submitted text
    and return a risk assessment.

    The model identifies grooming stages (trust-building, isolation,
    desensitization, sexual content introduction, maintenance of
    control) and flags specific phrases that triggered the detection.
    """
    ...


@grooming_router.post(
    "/analyze/batch",
    response_model=GroomingBatchJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(audit_log)],
    summary="Submit a batch of texts for grooming analysis",
)
async def batch_grooming_analysis(
    body: GroomingBatchRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Enqueue up to 200 texts for asynchronous grooming analysis.

    Use ``GET /grooming/results/{job_id}`` to retrieve results once
    processing completes.
    """
    ...


@grooming_router.get(
    "/results/{analysis_id}",
    response_model=GroomingResultResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single grooming analysis result",
)
async def get_grooming_result(
    analysis_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the full result of a grooming analysis by its UUID."""
    ...


@grooming_router.get(
    "/results",
    response_model=PaginatedResponse,
    summary="List grooming analysis results with filtering",
)
async def list_grooming_results(
    risk_level: Optional[GroomingRiskLevelEnum] = Query(default=None),
    min_score: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    case_id: Optional[uuid.UUID] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Paginated list of grooming analysis results with optional
    filtering by risk level, minimum score, or case.
    """
    ...


@grooming_router.get(
    "/stats",
    response_model=GroomingStatsResponse,
    summary="Grooming analysis statistics",
)
async def grooming_stats(user: CurrentUser = Depends(get_current_user)):
    """Return aggregate statistics for grooming analysis."""
    ...


# ============================================================================
# 7. OSINT  --  /api/v1/osint
# ============================================================================

osint_router = APIRouter(
    prefix="/api/v1/osint",
    tags=["OSINT"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class OsintSearchRequest(BaseModel):
    query_type: OsintQueryType
    query_value: str = Field(..., min_length=1, max_length=2000)
    modules: Optional[list[str]] = Field(
        default=None,
        description="Specific OSINT modules to query; if null, all enabled modules are used",
    )
    case_id: Optional[uuid.UUID] = None
    entity_id: Optional[uuid.UUID] = None


class OsintBulkSearchRequest(BaseModel):
    queries: list[OsintSearchRequest] = Field(..., min_length=1, max_length=100)


class OsintEnrichRequest(BaseModel):
    """Enrich an existing entity with additional OSINT data."""
    entity_id: uuid.UUID
    modules: Optional[list[str]] = None


class OsintResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    module_name: str
    query_type: str
    query_value: str
    result_data: dict[str, Any]
    confidence: float
    source_url: Optional[str] = None
    queried_at: datetime


class OsintBulkJobResponse(BaseModel):
    job_id: uuid.UUID
    queries_submitted: int
    estimated_seconds: Optional[int] = None


class OsintModuleStatus(BaseModel):
    name: str
    enabled: bool
    rate_limit: int
    requests_remaining: int
    last_error: Optional[str] = None


# -- Endpoints --------------------------------------------------------------

@osint_router.post(
    "/search",
    response_model=list[OsintResultResponse],
    dependencies=[Depends(audit_log)],
    summary="Run OSINT search across enabled modules",
)
async def osint_search(
    body: OsintSearchRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Execute an OSINT query (email, username, phone, domain, IP, or
    name) across all enabled modules or a specified subset.

    Results are aggregated and de-duplicated before return.
    """
    ...


@osint_router.post(
    "/search/bulk",
    response_model=OsintBulkJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(audit_log)],
    summary="Submit a bulk OSINT search (up to 100 queries)",
)
async def osint_bulk_search(
    body: OsintBulkSearchRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Enqueue up to 100 OSINT queries for batch processing."""
    ...


@osint_router.post(
    "/enrich",
    response_model=list[OsintResultResponse],
    dependencies=[Depends(audit_log)],
    summary="Enrich an existing entity with OSINT data",
)
async def osint_enrich(
    body: OsintEnrichRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Run all applicable OSINT modules against the entity's known
    identifiers and merge new findings back into the entity record.
    """
    ...


@osint_router.get(
    "/results",
    response_model=PaginatedResponse,
    summary="List OSINT results with filtering",
)
async def list_osint_results(
    query_type: Optional[OsintQueryType] = Query(default=None),
    module_name: Optional[str] = Query(default=None, max_length=100),
    case_id: Optional[uuid.UUID] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Paginated listing of OSINT results with optional filters."""
    ...


@osint_router.get(
    "/results/{result_id}",
    response_model=OsintResultResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single OSINT result",
)
async def get_osint_result(
    result_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return full details for a single OSINT result."""
    ...


@osint_router.get(
    "/modules",
    response_model=list[OsintModuleStatus],
    summary="List available OSINT modules and their status",
)
async def list_osint_modules(user: CurrentUser = Depends(get_current_user)):
    """Return the status of every configured OSINT module including
    rate-limit usage and error state.
    """
    ...


# ============================================================================
# 8. DARKWEB  --  /api/v1/darkweb
# ============================================================================

darkweb_router = APIRouter(
    prefix="/api/v1/darkweb",
    tags=["Dark Web"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class DarkwebCrawlerCreate(BaseModel):
    name: str = Field(..., max_length=200)
    seed_onion_urls: list[str] = Field(..., min_length=1, max_length=20)
    max_depth: int = Field(default=2, ge=1, le=5)
    crawl_interval_minutes: int = Field(default=60, ge=10, le=1440)
    keywords: list[str] = Field(default_factory=list, max_length=50)
    case_id: Optional[uuid.UUID] = None


class DarkwebCrawlerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    state: CrawlerState
    seed_onion_urls: list[str]
    max_depth: int
    crawl_interval_minutes: int
    keywords: list[str]
    pages_crawled: int = 0
    sightings_found: int = 0
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime


class DarkwebCrawlerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    state: Optional[CrawlerState] = None
    max_depth: Optional[int] = Field(default=None, ge=1, le=5)
    crawl_interval_minutes: Optional[int] = Field(default=None, ge=10, le=1440)
    keywords: Optional[list[str]] = None


class DarkwebSightingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    onion_url: str
    page_title: Optional[str] = None
    content_hash: str
    content_type: str
    keywords_found: Optional[list[str]] = None
    risk_score: float
    classification: Optional[str] = None
    linked_clearnet_domains: Optional[list[str]] = None
    first_seen: datetime
    last_seen: datetime


class ForumMonitorCreate(BaseModel):
    forum_url: str = Field(..., max_length=2000)
    name: str = Field(..., max_length=200)
    keywords: list[str] = Field(default_factory=list, max_length=100)
    check_interval_minutes: int = Field(default=30, ge=5, le=1440)
    case_id: Optional[uuid.UUID] = None


class ForumMonitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    forum_url: str
    name: str
    state: CrawlerState
    keywords: list[str]
    check_interval_minutes: int
    posts_collected: int = 0
    last_check_at: Optional[datetime] = None
    created_at: datetime


# -- Endpoints --------------------------------------------------------------

@darkweb_router.post(
    "/crawlers",
    response_model=DarkwebCrawlerResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Create a new dark web crawler",
)
async def create_crawler(
    body: DarkwebCrawlerCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Configure and launch a new Tor-based crawler.

    The crawler runs periodically at the specified interval and indexes
    metadata from discovered pages.  Content is **never** stored
    directly; only hashes, metadata, and keyword hits are recorded.
    """
    ...


@darkweb_router.get(
    "/crawlers",
    response_model=PaginatedResponse,
    summary="List all dark web crawlers",
)
async def list_crawlers(
    state: Optional[CrawlerState] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated list of configured dark web crawlers."""
    ...


@darkweb_router.get(
    "/crawlers/{crawler_id}",
    response_model=DarkwebCrawlerResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get crawler details",
)
async def get_crawler(
    crawler_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return full detail for a single dark web crawler."""
    ...


@darkweb_router.patch(
    "/crawlers/{crawler_id}",
    response_model=DarkwebCrawlerResponse,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Update crawler configuration",
)
async def update_crawler(
    body: DarkwebCrawlerUpdate,
    crawler_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Modify a crawler's configuration or state (pause, resume, stop)."""
    ...


@darkweb_router.delete(
    "/crawlers/{crawler_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Delete a crawler",
)
async def delete_crawler(
    crawler_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Stop and remove a dark web crawler.  Historical sightings are
    retained.
    """
    ...


@darkweb_router.get(
    "/sightings",
    response_model=PaginatedResponse,
    summary="List dark web sightings",
)
async def list_sightings(
    min_risk_score: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    keyword: Optional[str] = Query(default=None, max_length=200),
    crawler_id: Optional[uuid.UUID] = Query(default=None),
    since: Optional[datetime] = Query(default=None, description="Only sightings after this timestamp"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Paginated listing of dark web sightings with optional filters."""
    ...


@darkweb_router.get(
    "/sightings/{sighting_id}",
    response_model=DarkwebSightingResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get sighting details",
)
async def get_sighting(
    sighting_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return full detail for a single dark web sighting."""
    ...


# Forum monitors

@darkweb_router.post(
    "/forums",
    response_model=ForumMonitorResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Create a forum monitor",
)
async def create_forum_monitor(
    body: ForumMonitorCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Set up periodic monitoring of a dark web forum for keyword matches."""
    ...


@darkweb_router.get(
    "/forums",
    response_model=PaginatedResponse,
    summary="List forum monitors",
)
async def list_forum_monitors(
    state: Optional[CrawlerState] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated list of configured forum monitors."""
    ...


@darkweb_router.delete(
    "/forums/{monitor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(audit_log)],
    summary="Delete a forum monitor",
)
async def delete_forum_monitor(
    monitor_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Stop and remove a forum monitor.  Historical data is retained."""
    ...


# ============================================================================
# 9. CRYPTO  --  /api/v1/crypto
# ============================================================================

crypto_router = APIRouter(
    prefix="/api/v1/crypto",
    tags=["Cryptocurrency Tracing"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class WalletTraceRequest(BaseModel):
    address: str = Field(..., min_length=20, max_length=200)
    blockchain: BlockchainEnum
    depth: int = Field(default=3, ge=1, le=10, description="How many hops to trace")
    direction: str = Field(
        default="both",
        pattern=r"^(incoming|outgoing|both)$",
        description="Trace direction",
    )
    case_id: Optional[uuid.UUID] = None


class TransactionAnalyzeRequest(BaseModel):
    tx_hash: str = Field(..., min_length=20, max_length=200)
    blockchain: BlockchainEnum


class ClusterFindRequest(BaseModel):
    address: str = Field(..., min_length=20, max_length=200)
    blockchain: BlockchainEnum


class MixerDetectRequest(BaseModel):
    addresses: list[str] = Field(..., min_length=1, max_length=50)
    blockchain: BlockchainEnum


class WalletResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    address: str
    blockchain: str
    cluster_id: Optional[str] = None
    label: Optional[str] = None
    known_service: Optional[str] = None
    is_mixer: bool
    is_exchange: bool
    total_received: Optional[float] = None
    total_sent: Optional[float] = None
    balance: Optional[float] = None
    first_tx_at: Optional[datetime] = None
    last_tx_at: Optional[datetime] = None
    risk_score: float


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tx_hash: str
    blockchain: str
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    amount: float
    amount_usd: Optional[float] = None
    fee: Optional[float] = None
    block_number: Optional[int] = None
    block_timestamp: Optional[datetime] = None
    is_mixer_tx: bool


class WalletTraceResponse(BaseModel):
    wallet: WalletResponse
    transactions: list[TransactionResponse]
    connected_wallets: list[WalletResponse]
    trace_depth_reached: int
    total_value_traced: float


class ClusterResponse(BaseModel):
    cluster_id: str
    wallets: list[WalletResponse]
    total_addresses: int
    total_value: float
    known_services: list[str]
    risk_score: float


class MixerDetectionResult(BaseModel):
    address: str
    is_mixer: bool
    confidence: float = Field(ge=0.0, le=1.0)
    mixer_type: Optional[str] = Field(
        default=None,
        description="coinjoin, wasabi, tornado_cash, chipmixer, etc.",
    )
    evidence: list[str] = Field(default_factory=list)


# -- Endpoints --------------------------------------------------------------

@crypto_router.post(
    "/trace",
    response_model=WalletTraceResponse,
    dependencies=[Depends(audit_log)],
    summary="Trace cryptocurrency wallet transactions",
)
async def trace_wallet(
    body: WalletTraceRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Trace the transaction graph from a wallet address up to the
    specified depth.  Returns the wallet, its transactions, and
    connected wallets.
    """
    ...


@crypto_router.post(
    "/transaction",
    response_model=TransactionResponse,
    dependencies=[Depends(audit_log)],
    summary="Analyze a single transaction",
)
async def analyze_transaction(
    body: TransactionAnalyzeRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Retrieve and analyze a specific blockchain transaction by hash."""
    ...


@crypto_router.post(
    "/cluster",
    response_model=ClusterResponse,
    dependencies=[Depends(audit_log)],
    summary="Find wallet cluster for an address",
)
async def find_cluster(
    body: ClusterFindRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Identify all wallets that are likely controlled by the same
    entity using common-input-ownership heuristics and known-service
    tagging.
    """
    ...


@crypto_router.post(
    "/mixer/detect",
    response_model=list[MixerDetectionResult],
    dependencies=[Depends(audit_log)],
    summary="Detect mixer usage for addresses",
)
async def detect_mixers(
    body: MixerDetectRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Analyze the transaction patterns of the given addresses to
    detect interaction with known mixing services (CoinJoin, Wasabi,
    Tornado Cash, etc.).
    """
    ...


@crypto_router.get(
    "/wallets/{address}",
    response_model=WalletResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Look up a wallet by address",
)
async def get_wallet(
    address: str = Path(..., min_length=20, max_length=200),
    blockchain: BlockchainEnum = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the stored profile for a single wallet address."""
    ...


@crypto_router.get(
    "/transactions",
    response_model=PaginatedResponse,
    summary="List transactions with filtering",
)
async def list_transactions(
    address: Optional[str] = Query(default=None, max_length=200),
    blockchain: Optional[BlockchainEnum] = Query(default=None),
    min_amount: Optional[float] = Query(default=None, ge=0),
    is_mixer_tx: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Paginated listing of cryptocurrency transactions with optional
    filters.
    """
    ...


# ============================================================================
# 10. GRAPH  --  /api/v1/graph
# ============================================================================

graph_router = APIRouter(
    prefix="/api/v1/graph",
    tags=["Knowledge Graph"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class GraphQueryRequest(BaseModel):
    """Free-form Cypher query with parameter binding (read-only)."""
    cypher: str = Field(..., max_length=5000, description="Read-only Cypher query")
    parameters: Optional[dict[str, Any]] = None
    limit: int = Field(default=100, ge=1, le=10000)


class NodeExpandRequest(BaseModel):
    node_id: str = Field(..., description="Neo4j node ID or entity UUID")
    relationship_types: Optional[list[str]] = None
    direction: str = Field(
        default="both",
        pattern=r"^(incoming|outgoing|both)$",
    )
    depth: int = Field(default=1, ge=1, le=5)
    limit: int = Field(default=50, ge=1, le=500)


class PathFindRequest(BaseModel):
    source_id: str = Field(..., description="Start node ID or entity UUID")
    target_id: str = Field(..., description="End node ID or entity UUID")
    max_depth: int = Field(default=6, ge=1, le=15)
    relationship_types: Optional[list[str]] = None


class SubgraphRequest(BaseModel):
    """Extract a subgraph around specified seed nodes."""
    seed_node_ids: list[str] = Field(..., min_length=1, max_length=20)
    depth: int = Field(default=2, ge=1, le=5)
    relationship_types: Optional[list[str]] = None
    max_nodes: int = Field(default=200, ge=1, le=5000)


class GraphNode(BaseModel):
    id: str
    labels: list[str]
    properties: dict[str, Any]


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    properties: dict[str, Any]


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    total_nodes: int
    total_edges: int
    truncated: bool = False


class PathResponse(BaseModel):
    paths: list[list[GraphNode | GraphEdge]]
    shortest_path_length: Optional[int] = None


class GraphStatsResponse(BaseModel):
    total_nodes: int
    total_edges: int
    node_type_counts: dict[str, int]
    edge_type_counts: dict[str, int]


# -- Endpoints --------------------------------------------------------------

@graph_router.post(
    "/query",
    response_model=GraphResponse,
    summary="Execute a read-only graph query",
)
async def graph_query(
    body: GraphQueryRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Execute a parameterised, read-only Cypher query against the
    Neo4j knowledge graph.

    Write operations are rejected.  Results are returned as a node/edge
    structure suitable for front-end visualisation.
    """
    ...


@graph_router.post(
    "/expand",
    response_model=GraphResponse,
    summary="Expand a node's neighbourhood",
)
async def expand_node(
    body: NodeExpandRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Return the immediate neighbourhood of a node, optionally
    filtered by relationship type and direction.
    """
    ...


@graph_router.post(
    "/paths",
    response_model=PathResponse,
    summary="Find shortest paths between two nodes",
)
async def find_paths(
    body: PathFindRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Compute the shortest path(s) between two nodes in the knowledge
    graph using breadth-first search up to ``max_depth``.
    """
    ...


@graph_router.post(
    "/subgraph",
    response_model=GraphResponse,
    summary="Extract a subgraph around seed nodes",
)
async def get_subgraph(
    body: SubgraphRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Extract a bounded subgraph centred on the given seed nodes.

    Useful for exporting a specific investigative cluster for offline
    analysis or reporting.
    """
    ...


@graph_router.get(
    "/stats",
    response_model=GraphStatsResponse,
    summary="Knowledge graph statistics",
)
async def graph_stats(user: CurrentUser = Depends(get_current_user)):
    """Return aggregate node and edge counts by type."""
    ...


# ============================================================================
# 11. GEO  --  /api/v1/geo
# ============================================================================

geo_router = APIRouter(
    prefix="/api/v1/geo",
    tags=["Geolocation"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class IPLookupRequest(BaseModel):
    ip_address: str = Field(..., max_length=45, description="IPv4 or IPv6 address")


class IPLookupResponse(BaseModel):
    ip_address: str
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_radius_km: Optional[int] = None
    timezone: Optional[str] = None
    asn: Optional[int] = None
    as_org: Optional[str] = None
    isp: Optional[str] = None
    is_vpn: Optional[bool] = None
    is_tor: Optional[bool] = None
    is_proxy: Optional[bool] = None
    is_hosting: Optional[bool] = None


class BulkIPLookupRequest(BaseModel):
    ip_addresses: list[str] = Field(..., min_length=1, max_length=500)


class HeatmapDataRequest(BaseModel):
    """Request heatmap data for a case or time range."""
    case_id: Optional[uuid.UUID] = None
    entity_type: Optional[EntityTypeEnum] = None
    since: Optional[datetime] = None
    until: Optional[datetime] = None


class HeatmapPoint(BaseModel):
    latitude: float
    longitude: float
    weight: float = Field(ge=0.0, description="Relative intensity")
    label: Optional[str] = None
    entity_id: Optional[uuid.UUID] = None


class HeatmapResponse(BaseModel):
    points: list[HeatmapPoint]
    total_points: int
    bounding_box: Optional[dict[str, float]] = None


class ASNInfoResponse(BaseModel):
    asn: int
    as_org: str
    country_code: Optional[str] = None
    ip_count: Optional[int] = None
    prefixes: list[str] = Field(default_factory=list)
    related_entities: int = 0


# -- Endpoints --------------------------------------------------------------

@geo_router.post(
    "/ip",
    response_model=IPLookupResponse,
    summary="Look up geolocation for an IP address",
)
async def ip_lookup(
    body: IPLookupRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Resolve an IP address to geolocation, ASN, and proxy/VPN/Tor
    detection data using MaxMind and supplementary sources.
    """
    ...


@geo_router.post(
    "/ip/bulk",
    response_model=list[IPLookupResponse],
    summary="Bulk IP geolocation lookup (up to 500)",
)
async def bulk_ip_lookup(
    body: BulkIPLookupRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Look up geolocation data for up to 500 IP addresses in a single
    request.
    """
    ...


@geo_router.post(
    "/heatmap",
    response_model=HeatmapResponse,
    summary="Generate heatmap data from geolocated entities",
)
async def heatmap_data(
    body: HeatmapDataRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Return weighted latitude/longitude points suitable for rendering
    a geographic heatmap on the front-end map component.
    """
    ...


@geo_router.get(
    "/asn/{asn_number}",
    response_model=ASNInfoResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get ASN information",
)
async def asn_info(
    asn_number: int = Path(..., ge=1, description="Autonomous System Number"),
    user: CurrentUser = Depends(get_current_user),
):
    """Return details about an Autonomous System including organisation
    name, country, IP prefix list, and linked entities in the database.
    """
    ...


# ============================================================================
# 12. ALERTS  --  /api/v1/alerts
# ============================================================================

alerts_router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["Alerts"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    severity: AlertSeverityEnum
    title: str
    description: str
    source_service: str
    entity_id: Optional[uuid.UUID] = None
    case_id: Optional[uuid.UUID] = None
    is_acknowledged: bool
    acknowledged_by: Optional[uuid.UUID] = None
    acknowledged_at: Optional[datetime] = None
    metadata_json: Optional[dict[str, Any]] = None
    created_at: datetime


class AlertAcknowledge(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=2000)


class AlertEscalate(BaseModel):
    target_user_id: uuid.UUID = Field(..., description="User to escalate to")
    reason: str = Field(..., min_length=1, max_length=2000)
    new_severity: Optional[AlertSeverityEnum] = None


class AlertCreate(BaseModel):
    """Manual alert creation (for testing or external integrations)."""
    severity: AlertSeverityEnum
    title: str = Field(..., max_length=500)
    description: str
    source_service: str = Field(default="manual", max_length=100)
    entity_id: Optional[uuid.UUID] = None
    case_id: Optional[uuid.UUID] = None
    metadata_json: Optional[dict[str, Any]] = None


class AlertStats(BaseModel):
    total: int
    unacknowledged: int
    by_severity: dict[str, int]
    by_source: dict[str, int]
    last_24h: int


# -- Endpoints --------------------------------------------------------------

@alerts_router.get(
    "",
    response_model=PaginatedResponse,
    summary="List alerts with filtering",
)
async def list_alerts(
    severity: Optional[AlertSeverityEnum] = Query(default=None),
    is_acknowledged: Optional[bool] = Query(default=None),
    case_id: Optional[uuid.UUID] = Query(default=None),
    source_service: Optional[str] = Query(default=None, max_length=100),
    since: Optional[datetime] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return a paginated list of alerts, newest first, with optional
    filtering by severity, acknowledgement status, case, or source.
    """
    ...


@alerts_router.get(
    "/stats",
    response_model=AlertStats,
    summary="Alert statistics overview",
)
async def alert_stats(user: CurrentUser = Depends(get_current_user)):
    """Return aggregate alert counts broken down by severity, source,
    and acknowledgement status.
    """
    ...


@alerts_router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single alert",
)
async def get_alert(
    alert_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Return full detail for one alert."""
    ...


@alerts_router.post(
    "",
    response_model=AlertResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Create an alert manually",
)
async def create_alert(
    body: AlertCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Manually create an alert.  Typically used for external
    integrations or testing.
    """
    ...


@alerts_router.post(
    "/{alert_id}/acknowledge",
    response_model=AlertResponse,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    summary="Acknowledge an alert",
)
async def acknowledge_alert(
    body: AlertAcknowledge,
    alert_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Mark an alert as acknowledged by the current user.

    Returns ``409 Conflict`` if the alert is already acknowledged.
    """
    ...


@alerts_router.post(
    "/{alert_id}/escalate",
    response_model=SuccessMessage,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Escalate an alert to another user",
)
async def escalate_alert(
    body: AlertEscalate,
    alert_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Escalate an alert to another user with an optional severity
    upgrade and mandatory reason.  The target user receives a
    notification.
    """
    ...


# ============================================================================
# 13. DASHBOARD  --  /api/v1/dashboard
# ============================================================================

dashboard_router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["Dashboard"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class DashboardOverview(BaseModel):
    cases_open: int
    cases_in_progress: int
    cases_pending_review: int
    total_evidence_items: int
    total_entities: int
    active_alerts: int
    critical_alerts: int
    hashes_ingested_today: int
    classifications_pending_review: int
    grooming_high_risk_count: int
    active_crawlers: int


class TimelineDataPoint(BaseModel):
    timestamp: datetime
    metric: str
    value: float
    metadata: Optional[dict[str, Any]] = None


class TimelineRequest(BaseModel):
    metrics: list[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Metric names: ingestions, alerts, classifications, grooming_detections, osint_queries",
    )
    start: datetime
    end: datetime
    interval: str = Field(
        default="1h",
        pattern=r"^(\d+)(m|h|d|w)$",
        description="Bucket interval: e.g. 15m, 1h, 1d, 1w",
    )
    case_id: Optional[uuid.UUID] = None


class TimelineResponse(BaseModel):
    data: list[TimelineDataPoint]
    start: datetime
    end: datetime
    interval: str


class RiskMatrixEntry(BaseModel):
    entity_id: uuid.UUID
    entity_type: EntityTypeEnum
    entity_value: str
    risk_score: float
    contributing_factors: list[str]
    case_ids: list[uuid.UUID] = Field(default_factory=list)


class RiskMatrixResponse(BaseModel):
    entries: list[RiskMatrixEntry]
    total: int
    generated_at: datetime


class CaseActivityItem(BaseModel):
    timestamp: datetime
    user_display_name: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[str] = None


# -- Endpoints --------------------------------------------------------------

@dashboard_router.get(
    "/overview",
    response_model=DashboardOverview,
    summary="Aggregated platform statistics",
)
async def dashboard_overview(
    user: CurrentUser = Depends(get_current_user),
):
    """Return high-level counters for the main dashboard view."""
    ...


@dashboard_router.post(
    "/timeline",
    response_model=TimelineResponse,
    summary="Time-series data for dashboard charts",
)
async def dashboard_timeline(
    body: TimelineRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Return bucketed time-series data for the requested metrics.

    Suitable for rendering line/area charts on the dashboard.
    """
    ...


@dashboard_router.get(
    "/risk-matrix",
    response_model=RiskMatrixResponse,
    summary="Top entities by risk score",
)
async def risk_matrix(
    limit: int = Query(default=50, ge=1, le=200),
    entity_type: Optional[EntityTypeEnum] = Query(default=None),
    min_risk_score: float = Query(default=0.5, ge=0.0, le=1.0),
    user: CurrentUser = Depends(get_current_user),
):
    """Return the highest-risk entities for triage and prioritisation."""
    ...


@dashboard_router.get(
    "/cases/{case_id}/activity",
    response_model=PaginatedResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Recent activity feed for a case",
)
async def case_activity(
    case_id: uuid.UUID = Path(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return a chronological activity feed for a case, derived from
    the audit log.
    """
    ...


# ============================================================================
# 14. SETTINGS  --  /api/v1/settings
# ============================================================================

settings_router = APIRouter(
    prefix="/api/v1/settings",
    tags=["Settings"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class IntegrationCreate(BaseModel):
    name: str = Field(..., max_length=200)
    category: str = Field(..., max_length=50)
    provider: str = Field(..., max_length=100)
    base_url: HttpUrl
    auth_type: str = Field(
        ...,
        pattern=r"^(api_key|oauth2|basic|none)$",
    )
    rate_limit: int = Field(default=60, ge=1, le=10000)
    is_enabled: bool = True
    config_json: Optional[dict[str, Any]] = None


class IntegrationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    base_url: Optional[HttpUrl] = None
    auth_type: Optional[str] = Field(default=None, pattern=r"^(api_key|oauth2|basic|none)$")
    rate_limit: Optional[int] = Field(default=None, ge=1, le=10000)
    is_enabled: Optional[bool] = None
    config_json: Optional[dict[str, Any]] = None


class IntegrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: str
    provider: str
    base_url: str
    auth_type: str
    rate_limit: int
    is_enabled: bool
    config_json: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class ThresholdConfig(BaseModel):
    csam_alert_threshold: float = Field(ge=0.0, le=1.0)
    nsfw_alert_threshold: float = Field(ge=0.0, le=1.0)
    grooming_alert_threshold: float = Field(ge=0.0, le=1.0)
    hamming_distance_threshold: int = Field(ge=0, le=64)
    risk_score_critical_threshold: float = Field(ge=0.0, le=1.0)
    risk_score_high_threshold: float = Field(ge=0.0, le=1.0)


class UserPreferences(BaseModel):
    timezone: str = Field(default="UTC", max_length=50)
    date_format: str = Field(default="YYYY-MM-DD", max_length=20)
    items_per_page: int = Field(default=25, ge=10, le=200)
    notification_email: bool = True
    notification_in_app: bool = True
    notification_slack: bool = False
    dashboard_layout: Optional[dict[str, Any]] = None


class NotificationPreferences(BaseModel):
    alert_severities: list[AlertSeverityEnum] = Field(
        default=[AlertSeverityEnum.HIGH, AlertSeverityEnum.CRITICAL],
    )
    case_updates: bool = True
    classification_results: bool = True
    grooming_alerts: bool = True
    darkweb_sightings: bool = True
    channels: list[str] = Field(default=["in_app", "email"])


# -- Endpoints --------------------------------------------------------------

@settings_router.get(
    "/integrations",
    response_model=PaginatedResponse,
    summary="List all configured integrations",
)
async def list_integrations(
    category: Optional[str] = Query(default=None, max_length=50),
    is_enabled: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """Return paginated list of external integrations."""
    ...


@settings_router.post(
    "/integrations",
    response_model=IntegrationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(audit_log)],
    summary="Add a new integration",
)
async def create_integration(
    body: IntegrationCreate,
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN)
    ),
):
    """Register a new external integration.  API credentials are stored
    in Vault and referenced via ``auth_config_vault_path``.
    """
    ...


@settings_router.patch(
    "/integrations/{integration_id}",
    response_model=IntegrationResponse,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Update an integration",
)
async def update_integration(
    body: IntegrationUpdate,
    integration_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN)
    ),
):
    """Update the configuration of an existing integration."""
    ...


@settings_router.delete(
    "/integrations/{integration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(audit_log)],
    responses={404: {"model": ErrorResponse}},
    summary="Remove an integration",
)
async def delete_integration(
    integration_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN)
    ),
):
    """Delete an integration and revoke its Vault credentials."""
    ...


@settings_router.post(
    "/integrations/{integration_id}/test",
    response_model=SuccessMessage,
    summary="Test an integration's connectivity",
)
async def test_integration(
    integration_id: uuid.UUID = Path(...),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN)
    ),
):
    """Attempt a health-check request against the integration's base
    URL and return success or failure details.
    """
    ...


# Thresholds

@settings_router.get(
    "/thresholds",
    response_model=ThresholdConfig,
    summary="Get current detection thresholds",
)
async def get_thresholds(
    user: CurrentUser = Depends(get_current_user),
):
    """Return the active detection and alerting thresholds."""
    ...


@settings_router.put(
    "/thresholds",
    response_model=ThresholdConfig,
    dependencies=[Depends(audit_log)],
    summary="Update detection thresholds",
)
async def update_thresholds(
    body: ThresholdConfig,
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.ADMIN)
    ),
):
    """Set new detection thresholds.  Changes take effect immediately
    for all new analyses.
    """
    ...


# User preferences

@settings_router.get(
    "/preferences",
    response_model=UserPreferences,
    summary="Get current user's preferences",
)
async def get_preferences(
    user: CurrentUser = Depends(get_current_user),
):
    """Return the authenticated user's display and notification
    preferences.
    """
    ...


@settings_router.put(
    "/preferences",
    response_model=UserPreferences,
    summary="Update current user's preferences",
)
async def update_preferences(
    body: UserPreferences,
    user: CurrentUser = Depends(get_current_user),
):
    """Replace the authenticated user's preferences with the supplied
    values.
    """
    ...


@settings_router.get(
    "/notifications",
    response_model=NotificationPreferences,
    summary="Get notification preferences",
)
async def get_notification_preferences(
    user: CurrentUser = Depends(get_current_user),
):
    """Return the current user's notification preferences."""
    ...


@settings_router.put(
    "/notifications",
    response_model=NotificationPreferences,
    summary="Update notification preferences",
)
async def update_notification_preferences(
    body: NotificationPreferences,
    user: CurrentUser = Depends(get_current_user),
):
    """Update which alert severities, event types, and delivery
    channels the current user receives notifications for.
    """
    ...


# ============================================================================
# 15. AUDIT  --  /api/v1/audit
# ============================================================================

audit_router = APIRouter(
    prefix="/api/v1/audit",
    tags=["Audit Trail"],
    dependencies=_auth_deps,
)


# -- Schemas ----------------------------------------------------------------

class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    user_id: uuid.UUID
    user_email: Optional[str] = None
    user_display_name: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    case_id: Optional[uuid.UUID] = None
    entry_hash: str
    previous_hash: str


class AuditIntegrityCheck(BaseModel):
    total_entries: int
    entries_checked: int
    chain_valid: bool
    first_broken_id: Optional[int] = None
    checked_at: datetime


# -- Endpoints --------------------------------------------------------------

@audit_router.get(
    "",
    response_model=PaginatedResponse,
    summary="Query the immutable audit log",
)
async def query_audit_logs(
    user_id: Optional[uuid.UUID] = Query(default=None, description="Filter by acting user"),
    action: Optional[str] = Query(default=None, max_length=100, description="Filter by action type"),
    resource_type: Optional[str] = Query(default=None, max_length=100),
    resource_id: Optional[str] = Query(default=None, max_length=200),
    case_id: Optional[uuid.UUID] = Query(default=None),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.AUDITOR, UserRoleEnum.ADMIN)
    ),
):
    """Query the immutable audit trail.

    Access is restricted to users with the ``auditor`` or ``admin``
    role.  Every entry includes a SHA-256 hash chain for tamper
    detection.
    """
    ...


@audit_router.get(
    "/{entry_id}",
    response_model=AuditLogEntry,
    responses={404: {"model": ErrorResponse}},
    summary="Retrieve a single audit log entry",
)
async def get_audit_entry(
    entry_id: int = Path(..., ge=1),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.AUDITOR, UserRoleEnum.ADMIN)
    ),
):
    """Return a single audit log entry by its sequential ID."""
    ...


@audit_router.get(
    "/integrity/check",
    response_model=AuditIntegrityCheck,
    summary="Verify audit log hash-chain integrity",
)
async def check_audit_integrity(
    start_id: Optional[int] = Query(default=None, ge=1),
    end_id: Optional[int] = Query(default=None, ge=1),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.AUDITOR, UserRoleEnum.ADMIN)
    ),
):
    """Walk the hash chain from ``start_id`` to ``end_id`` (or the
    full log if unspecified) and verify that no entries have been
    tampered with.

    Returns ``chain_valid = false`` and the ``first_broken_id`` if
    any link in the chain fails verification.
    """
    ...


@audit_router.get(
    "/export",
    summary="Export audit logs as CSV or JSON",
)
async def export_audit_logs(
    format: str = Query(default="csv", pattern=r"^(csv|json)$"),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
    case_id: Optional[uuid.UUID] = Query(default=None),
    user: CurrentUser = Depends(
        require_roles(UserRoleEnum.AUDITOR, UserRoleEnum.ADMIN)
    ),
):
    """Export filtered audit logs as a downloadable CSV or JSON file.

    This endpoint streams the response for large result sets and sets
    appropriate ``Content-Disposition`` headers for browser download.
    """
    ...


# ============================================================================
# WebSocket  --  /api/v1/ws/alerts
# ============================================================================

ws_router = APIRouter(tags=["WebSocket"])


class WSAlertMessage(BaseModel):
    """Structure of messages pushed through the real-time alert WebSocket."""
    event: str = Field(..., description="alert_new | alert_updated | alert_acknowledged")
    alert: AlertResponse


@ws_router.websocket("/api/v1/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """Real-time alert stream via WebSocket.

    **Connection protocol**:

    1. The client connects to ``ws(s)://<host>/api/v1/ws/alerts``.
    2. The first message from the client **must** be a JSON object
       containing ``{"token": "<JWT>"}`` for authentication.
    3. On successful auth the server sends ``{"event": "connected"}``.
    4. Subsequent messages are ``WSAlertMessage`` objects pushed
       whenever a new or updated alert matches the user's subscriptions.
    5. The client may send ``{"event": "ping"}`` to keep the
       connection alive; the server responds with ``{"event": "pong"}``.
    6. The client may send filter commands:
       ``{"event": "subscribe", "severities": ["high", "critical"]}``
       ``{"event": "subscribe", "case_ids": ["<uuid>"]}``

    Disconnection is graceful on either side.
    """
    await websocket.accept()

    # -- Step 1: Authenticate via first message --
    try:
        auth_data = await websocket.receive_json()
        token = auth_data.get("token")
        if not token:
            await websocket.send_json({"event": "error", "message": "Missing token"})
            await websocket.close(code=4001, reason="Authentication required")
            return
        # In production: validate JWT, extract user, check permissions
        # user = await validate_ws_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    await websocket.send_json({"event": "connected"})

    # -- Step 2: Listen for subscriptions and push alerts --
    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event")

            if event == "ping":
                await websocket.send_json({"event": "pong"})
            elif event == "subscribe":
                # Update the user's subscription filters
                await websocket.send_json({
                    "event": "subscribed",
                    "filters": {
                        k: v for k, v in data.items() if k != "event"
                    },
                })
            else:
                await websocket.send_json({
                    "event": "error",
                    "message": f"Unknown event: {event}",
                })
    except WebSocketDisconnect:
        pass  # Client disconnected cleanly
    except Exception:
        await websocket.close(code=1011, reason="Internal error")


# ============================================================================
# Health check (no auth)
# ============================================================================

health_router = APIRouter(tags=["Health"])


class HealthStatus(BaseModel):
    status: str = "ok"
    version: str
    environment: str
    uptime_seconds: float
    services: dict[str, str] = Field(
        default_factory=dict,
        description="Status of dependent services: postgres, neo4j, redis, elasticsearch, kafka",
    )


@health_router.get(
    "/api/v1/health",
    response_model=HealthStatus,
    summary="Platform health check",
)
async def health_check():
    """Unauthenticated health endpoint for load balancers and
    monitoring systems.

    Returns connectivity status for all dependent services.
    """
    ...


@health_router.get(
    "/api/v1/health/ready",
    status_code=status.HTTP_200_OK,
    summary="Readiness probe",
)
async def readiness_probe():
    """Returns ``200 OK`` when the service is ready to accept traffic.

    Returns ``503 Service Unavailable`` if any critical dependency is
    down.
    """
    ...


# ============================================================================
# LLM & AI Analysis Router
# ============================================================================

llm_router = APIRouter(prefix="/llm", tags=["llm"])
ai_analysis_router = APIRouter(prefix="/ai-analysis", tags=["ai-analysis"])


class LLMAnalyzeRequest(BaseModel):
    """Request LLM analysis of content metadata."""
    hash_id: str = Field(..., description="Content hash record ID")
    hash_value: str = Field(..., description="Hash prefix")
    classification_scores: dict[str, float] = Field(
        ..., description="AI classifier scores (nsfw, csam_risk, etc.)"
    )
    source: str = Field(default="manual", description="Detection source")
    provider: Optional[str] = Field(
        default=None,
        description="LLM provider override (anthropic, openai, deepseek, openrouter)",
    )


class LLMAnalyzeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str
    model: str
    risk_assessment: str
    suggested_action: str
    reasoning: str
    confidence: float
    analyzed_at: str


class LLMChatRequest(BaseModel):
    """OSINT agent chat request."""
    messages: list[dict[str, str]] = Field(
        ..., description="Conversation messages [{role, content}]"
    )
    query_context: Optional[dict[str, str]] = Field(
        default=None, description="Current OSINT query context"
    )
    findings_summary: Optional[list[dict[str, Any]]] = Field(
        default=None, description="Summary of current findings"
    )
    case_id: Optional[str] = None


class LLMChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: str = "assistant"
    content: str
    suggested_queries: list[dict[str, str]] = Field(default_factory=list)
    provider: str
    model: str
    elapsed_ms: int


class LLMProviderInfo(BaseModel):
    provider: str
    model: str
    healthy: bool
    base_url: str


class AIorNotCheckRequest(BaseModel):
    """Request AIorNot check for a content hash."""
    hash_value: str = Field(..., description="Content hash to check")
    hash_type: str = Field(default="sha256", description="Hash algorithm")


class AIorNotCheckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hash_id: str
    verdict: str
    confidence: float
    ai_model_detected: Optional[str]
    checked_at: str


class AIAnalysisResultsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hash_id: str
    aiornot_result: Optional[AIorNotCheckResponse] = None
    llm_analysis: Optional[LLMAnalyzeResponse] = None


@llm_router.post(
    "/analyze",
    response_model=LLMAnalyzeResponse,
    summary="LLM content metadata analysis",
    description=(
        "Request LLM analysis of content classification metadata. "
        "IMPORTANT: Raw images are NEVER sent — only hashes, scores, metadata."
    ),
)
async def llm_analyze(body: LLMAnalyzeRequest):
    """Analyze content metadata using configured LLM provider."""
    ...


@llm_router.post(
    "/chat",
    response_model=LLMChatResponse,
    summary="OSINT Agent chat",
    description="Send a message to the OSINT investigation AI agent.",
)
async def llm_chat(body: LLMChatRequest):
    """Process OSINT agent chat message."""
    ...


@llm_router.get(
    "/providers",
    response_model=list[LLMProviderInfo],
    summary="List configured LLM providers",
)
async def llm_providers():
    """Return all configured LLM providers with health status."""
    ...


@ai_analysis_router.post(
    "/aiornot/{hash_id}",
    response_model=AIorNotCheckResponse,
    summary="AIorNot AI-generated content check",
    description="Check a content hash against the AIorNot API to detect AI-generated content.",
)
async def aiornot_check(
    hash_id: str = Path(..., description="Content hash record ID"),
    body: AIorNotCheckRequest = Body(...),
):
    """Run AIorNot detection on a content hash."""
    ...


@ai_analysis_router.get(
    "/results/{hash_id}",
    response_model=AIAnalysisResultsResponse,
    summary="Get all AI analysis results for a hash",
    description="Retrieve AIorNot and LLM analysis results for a content hash.",
)
async def ai_analysis_results(
    hash_id: str = Path(..., description="Content hash record ID"),
):
    """Get aggregated AI analysis results."""
    ...


# ============================================================================
# Root API Router  --  aggregates all sub-routers
# ============================================================================

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(cases_router)
api_router.include_router(ingest_router)
api_router.include_router(hashes_router)
api_router.include_router(classify_router)
api_router.include_router(grooming_router)
api_router.include_router(osint_router)
api_router.include_router(darkweb_router)
api_router.include_router(crypto_router)
api_router.include_router(graph_router)
api_router.include_router(geo_router)
api_router.include_router(alerts_router)
api_router.include_router(dashboard_router)
api_router.include_router(settings_router)
api_router.include_router(audit_router)
api_router.include_router(ws_router)
api_router.include_router(llm_router)
api_router.include_router(ai_analysis_router)
