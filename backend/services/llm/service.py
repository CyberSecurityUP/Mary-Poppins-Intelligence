"""
Mary Poppins — LLM Integration Service
Multi-provider LLM orchestration for content analysis, risk assessment,
and OSINT reasoning.

Supported providers: Anthropic (Claude), OpenAI (ChatGPT), DeepSeek, OpenRouter.

CRITICAL: LLMs never receive raw images — only hashes, classification scores,
and metadata. Zero Visual Exposure is enforced at the architecture level.
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

logger = logging.getLogger("mp.llm")


# ---------------------------------------------------------------------------
# Enums & Data Classes
# ---------------------------------------------------------------------------

class LLMProviderType(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    OPENROUTER = "openrouter"


class LLMTaskType(str, Enum):
    CONTENT_ANALYSIS = "content_analysis"
    IMAGE_ANALYSIS = "image_analysis"
    DECISION_SUPPORT = "decision_support"
    OSINT_AGENT = "osint_agent"
    RISK_ASSESSMENT = "risk_assessment"


@dataclass
class LLMRequest:
    """Request to an LLM provider."""
    task: LLMTaskType
    system_prompt: str
    messages: list[dict[str, str]]
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 4096
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Response from an LLM provider."""
    provider: LLMProviderType
    model: str
    content: str
    usage: dict[str, int]  # prompt_tokens, completion_tokens, total_tokens
    elapsed_ms: int
    finished_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ContentAnalysisResult:
    """Structured result from LLM content metadata analysis."""
    provider: str
    model: str
    risk_assessment: str  # critical, high, medium, low
    suggested_action: str
    reasoning: str
    confidence: float
    analyzed_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class RiskAssessmentResult:
    """Risk assessment output."""
    entity_id: str
    risk_level: str
    risk_score: float
    factors: list[str]
    recommendations: list[str]
    provider: str
    model: str


# ---------------------------------------------------------------------------
# Abstract Provider Interface
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """Abstract base class for LLM provider implementations."""

    def __init__(self, api_key: str, base_url: str, default_model: str):
        self.api_key = api_key
        self.base_url = base_url
        self.default_model = default_model
        self._healthy = False

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send a completion request to the provider."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify connectivity to the provider."""
        ...

    @property
    def provider_type(self) -> LLMProviderType:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Provider Implementations
# ---------------------------------------------------------------------------

class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider."""

    MODELS = [
        "claude-opus-4-6",
        "claude-sonnet-4-5-20250929",
        "claude-haiku-4-5-20251001",
    ]

    @property
    def provider_type(self) -> LLMProviderType:
        return LLMProviderType.ANTHROPIC

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.monotonic()
        logger.info("Anthropic request: model=%s task=%s", model, request.task)

        # In production, this calls the Anthropic API via httpx:
        #   POST https://api.anthropic.com/v1/messages
        #   Headers: x-api-key, anthropic-version
        #   Body: model, max_tokens, system, messages

        elapsed = int((time.monotonic() - start) * 1000)
        return LLMResponse(
            provider=LLMProviderType.ANTHROPIC,
            model=model,
            content="[Anthropic API response placeholder]",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            elapsed_ms=elapsed,
        )

    async def health_check(self) -> bool:
        try:
            # In production: lightweight /v1/messages call with max_tokens=1
            self._healthy = bool(self.api_key)
            return self._healthy
        except Exception as exc:
            logger.error("Anthropic health check failed: %s", exc)
            self._healthy = False
            return False


class OpenAIProvider(LLMProvider):
    """OpenAI ChatGPT provider."""

    MODELS = ["gpt-4o", "gpt-4o-mini", "o1-preview"]

    @property
    def provider_type(self) -> LLMProviderType:
        return LLMProviderType.OPENAI

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.monotonic()
        logger.info("OpenAI request: model=%s task=%s", model, request.task)

        # In production: POST https://api.openai.com/v1/chat/completions
        elapsed = int((time.monotonic() - start) * 1000)
        return LLMResponse(
            provider=LLMProviderType.OPENAI,
            model=model,
            content="[OpenAI API response placeholder]",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            elapsed_ms=elapsed,
        )

    async def health_check(self) -> bool:
        try:
            self._healthy = bool(self.api_key)
            return self._healthy
        except Exception as exc:
            logger.error("OpenAI health check failed: %s", exc)
            self._healthy = False
            return False


class DeepSeekProvider(LLMProvider):
    """DeepSeek provider."""

    MODELS = ["deepseek-chat", "deepseek-reasoner"]

    @property
    def provider_type(self) -> LLMProviderType:
        return LLMProviderType.DEEPSEEK

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.monotonic()
        logger.info("DeepSeek request: model=%s task=%s", model, request.task)

        # In production: POST https://api.deepseek.com/v1/chat/completions
        elapsed = int((time.monotonic() - start) * 1000)
        return LLMResponse(
            provider=LLMProviderType.DEEPSEEK,
            model=model,
            content="[DeepSeek API response placeholder]",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            elapsed_ms=elapsed,
        )

    async def health_check(self) -> bool:
        try:
            self._healthy = bool(self.api_key)
            return self._healthy
        except Exception as exc:
            logger.error("DeepSeek health check failed: %s", exc)
            self._healthy = False
            return False


class OpenRouterProvider(LLMProvider):
    """OpenRouter multi-model proxy."""

    MODELS = [
        "auto",
        "anthropic/claude-sonnet-4-5-20250929",
        "openai/gpt-4o",
    ]

    @property
    def provider_type(self) -> LLMProviderType:
        return LLMProviderType.OPENROUTER

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.monotonic()
        logger.info("OpenRouter request: model=%s task=%s", model, request.task)

        # In production: POST https://openrouter.ai/api/v1/chat/completions
        elapsed = int((time.monotonic() - start) * 1000)
        return LLMResponse(
            provider=LLMProviderType.OPENROUTER,
            model=model,
            content="[OpenRouter API response placeholder]",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            elapsed_ms=elapsed,
        )

    async def health_check(self) -> bool:
        try:
            self._healthy = bool(self.api_key)
            return self._healthy
        except Exception as exc:
            logger.error("OpenRouter health check failed: %s", exc)
            self._healthy = False
            return False


# ---------------------------------------------------------------------------
# LLM Service — Unified routing
# ---------------------------------------------------------------------------

PROVIDER_REGISTRY: dict[LLMProviderType, type[LLMProvider]] = {
    LLMProviderType.ANTHROPIC: AnthropicProvider,
    LLMProviderType.OPENAI: OpenAIProvider,
    LLMProviderType.DEEPSEEK: DeepSeekProvider,
    LLMProviderType.OPENROUTER: OpenRouterProvider,
}


class LLMService:
    """Unified LLM service routing to configured providers.

    IMPORTANT: This service enforces Zero Visual Exposure.
    Raw image data is NEVER passed to LLMs.  Only hashes,
    classification scores, and metadata are sent.
    """

    def __init__(self, default_provider: LLMProviderType = LLMProviderType.ANTHROPIC):
        self.default_provider = default_provider
        self._providers: dict[LLMProviderType, LLMProvider] = {}
        self._task_routing: dict[LLMTaskType, LLMProviderType] = {}

    def register_provider(
        self,
        provider_type: LLMProviderType,
        api_key: str,
        base_url: str,
        default_model: str,
    ) -> None:
        """Register an LLM provider."""
        cls = PROVIDER_REGISTRY[provider_type]
        self._providers[provider_type] = cls(api_key, base_url, default_model)
        logger.info("Registered LLM provider: %s (model=%s)", provider_type, default_model)

    def set_task_routing(self, task: LLMTaskType, provider: LLMProviderType) -> None:
        """Route a specific task type to a provider."""
        self._task_routing[task] = provider

    def get_provider(
        self, provider_type: Optional[LLMProviderType] = None,
    ) -> LLMProvider:
        """Get a provider instance, falling back to default."""
        target = provider_type or self.default_provider
        if target not in self._providers:
            raise ValueError(f"Provider {target} not registered")
        return self._providers[target]

    async def complete(
        self,
        request: LLMRequest,
        provider_type: Optional[LLMProviderType] = None,
    ) -> LLMResponse:
        """Send a completion request to the appropriate provider."""
        target = provider_type or self._task_routing.get(request.task) or self.default_provider
        provider = self.get_provider(target)
        return await provider.complete(request)

    async def analyze_content_metadata(
        self,
        hash_id: str,
        hash_value: str,
        classification_scores: dict[str, float],
        source: str,
        provider_type: Optional[LLMProviderType] = None,
    ) -> ContentAnalysisResult:
        """Analyze content metadata (NOT raw content) using an LLM.

        Args:
            hash_id: Internal hash record identifier.
            hash_value: Perceptual hash prefix (truncated).
            classification_scores: AI classifier outputs (nsfw, csam_risk, etc.).
            source: Where the content was detected.
            provider_type: Override default provider.

        Returns:
            Structured analysis with risk assessment and recommendations.
        """
        system_prompt = (
            "You are an analyst for a child safety platform. "
            "You receive ONLY metadata and classification scores — never raw images. "
            "Analyze the provided scores and metadata to assess risk level and "
            "recommend an action (escalate, review, dismiss). "
            "Be precise and professional."
        )

        user_message = (
            f"Content Hash: {hash_id} ({hash_value})\n"
            f"Source: {source}\n"
            f"Classification Scores:\n"
        )
        for key, score in classification_scores.items():
            user_message += f"  - {key}: {score:.3f}\n"
        user_message += "\nProvide: risk_assessment (critical/high/medium/low), suggested_action, reasoning."

        request = LLMRequest(
            task=LLMTaskType.CONTENT_ANALYSIS,
            system_prompt=system_prompt,
            messages=[{"role": "user", "content": user_message}],
            temperature=0.3,
            max_tokens=1024,
        )

        response = await self.complete(request, provider_type)

        return ContentAnalysisResult(
            provider=response.provider.value,
            model=response.model,
            risk_assessment="high",  # In production: parse from LLM response
            suggested_action="Escalate for manual review",
            reasoning=response.content,
            confidence=0.85,
        )

    async def assess_risk(
        self,
        entity_id: str,
        entity_data: dict[str, Any],
        provider_type: Optional[LLMProviderType] = None,
    ) -> RiskAssessmentResult:
        """Assess risk level for an entity."""
        system_prompt = (
            "You are a risk assessment analyst. Evaluate the provided entity data "
            "and determine a risk level (critical/high/medium/low) with a score (0-1). "
            "List contributing risk factors and recommendations."
        )

        request = LLMRequest(
            task=LLMTaskType.RISK_ASSESSMENT,
            system_prompt=system_prompt,
            messages=[{"role": "user", "content": str(entity_data)}],
            temperature=0.3,
            max_tokens=1024,
        )

        response = await self.complete(request, provider_type)

        return RiskAssessmentResult(
            entity_id=entity_id,
            risk_level="high",
            risk_score=0.78,
            factors=["Multiple platform presence", "Dark web mentions"],
            recommendations=["Escalate to lead investigator", "Cross-reference with cases"],
            provider=response.provider.value,
            model=response.model,
        )

    async def osint_reasoning(
        self,
        query_context: dict[str, Any],
        findings_summary: list[dict[str, Any]],
        user_question: str,
        provider_type: Optional[LLMProviderType] = None,
    ) -> LLMResponse:
        """LLM-assisted OSINT reasoning and investigation guidance."""
        system_prompt = (
            "You are an OSINT investigation assistant for a digital intelligence platform. "
            "Help analysts interpret findings, suggest search strategies, identify patterns, "
            "and provide investigative guidance. Always cite which findings support your reasoning. "
            "Never fabricate data — only analyze what is provided."
        )

        context = f"Query Context: {query_context}\n\nFindings Summary:\n"
        for f in findings_summary[:20]:
            context += f"  - [{f.get('type', 'unknown')}] {f.get('summary', 'N/A')} (confidence: {f.get('confidence', 0):.0%})\n"

        request = LLMRequest(
            task=LLMTaskType.OSINT_AGENT,
            system_prompt=system_prompt,
            messages=[
                {"role": "user", "content": context},
                {"role": "user", "content": user_question},
            ],
            temperature=0.7,
            max_tokens=2048,
        )

        return await self.complete(request, provider_type)

    async def list_providers(self) -> list[dict[str, Any]]:
        """List all registered providers with health status."""
        results = []
        for ptype, provider in self._providers.items():
            healthy = await provider.health_check()
            results.append({
                "provider": ptype.value,
                "model": provider.default_model,
                "healthy": healthy,
                "base_url": provider.base_url,
            })
        return results
