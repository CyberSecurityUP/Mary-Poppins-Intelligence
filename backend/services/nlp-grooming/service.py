"""
Mary Poppins — NLP Grooming Detection Service
Analyzes text content for online grooming patterns, risk scoring,
and stage identification.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

logger = logging.getLogger("mp.grooming")


class GroomingStage(str, Enum):
    """
    Recognized stages of online grooming (based on O'Connell model
    and Kloess et al. research):
    """
    FRIENDSHIP_FORMING = "friendship_forming"
    RELATIONSHIP_FORMING = "relationship_forming"
    RISK_ASSESSMENT = "risk_assessment"
    EXCLUSIVITY = "exclusivity"
    SEXUAL_STAGE = "sexual_stage"
    COMPLIANCE = "compliance"


class RiskLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class GroomingIndicator:
    """A single detected grooming indicator in the text."""
    indicator_type: str  # age_query, isolation, secrecy, flattery, desensitization, etc.
    text_span: str  # The matched phrase (sanitized)
    start_offset: int
    end_offset: int
    confidence: float
    stage: Optional[GroomingStage] = None


@dataclass
class GroomingAnalysisResult:
    text_hash: str
    risk_level: RiskLevel
    risk_score: float  # 0.0 - 1.0
    stage_detected: Optional[GroomingStage]
    stage_scores: dict[str, float]
    indicators: list[GroomingIndicator]
    flagged_phrases: list[str]
    language: str
    model_name: str
    model_version: str
    processing_time_ms: int
    analyzed_at: datetime = field(default_factory=datetime.utcnow)


# ──────────────────────────────────────────────────────────────────────
# Grooming detection patterns (rule-based layer)
# ──────────────────────────────────────────────────────────────────────

GROOMING_PATTERNS = {
    "age_query": {
        "patterns": [
            r"\bhow old\b.*\byou\b",
            r"\bwhat(?:'s| is) your age\b",
            r"\bare you\b.*\b\d{1,2}\b",
            r"\bASL\b",
            r"\bage\b.*\b(?:sex|gender)\b.*\blocation\b",
        ],
        "stage": GroomingStage.FRIENDSHIP_FORMING,
        "weight": 0.3,
    },
    "isolation": {
        "patterns": [
            r"\bdon'?t tell\b.*\b(?:anyone|parents|mom|dad|teacher)\b",
            r"\bour (?:little )?secret\b",
            r"\bjust between (?:us|you and me)\b",
            r"\bno one (?:needs to|has to|should) know\b",
            r"\bkeep (?:this|it) (?:between|private|quiet)\b",
        ],
        "stage": GroomingStage.EXCLUSIVITY,
        "weight": 0.8,
    },
    "secrecy": {
        "patterns": [
            r"\bdelete (?:this|the|these|our) (?:messages?|chat|conversation)\b",
            r"\buse (?:a |this )?(?:secret|private|hidden) (?:app|account)\b",
            r"\bmove to\b.*\b(?:kik|telegram|signal|wickr|snap)\b",
            r"\bdon'?t (?:show|share)\b.*\bphone\b",
        ],
        "stage": GroomingStage.RISK_ASSESSMENT,
        "weight": 0.7,
    },
    "flattery_excessive": {
        "patterns": [
            r"\byou(?:'re| are) (?:so |very )?(?:mature|grown up|special|different)\b",
            r"\byou(?:'re| are) not like (?:other|most) (?:girls|boys|kids)\b",
            r"\byou(?:'re| are) (?:so |very )?(?:beautiful|pretty|handsome|hot|sexy)\b",
            r"\bi(?:'ve| have) never met anyone like you\b",
        ],
        "stage": GroomingStage.RELATIONSHIP_FORMING,
        "weight": 0.4,
    },
    "desensitization": {
        "patterns": [
            r"\bhave you ever\b.*\b(?:kissed|touched|seen)\b",
            r"\bit(?:'s| is) (?:normal|natural|okay|fine)\b.*\b(?:between|for)\b",
            r"\beveryone (?:does|your age does) (?:it|this)\b",
            r"\bhave you (?:ever )?(?:sent|shared|taken)\b.*\b(?:pic|photo|selfie)\b",
        ],
        "stage": GroomingStage.SEXUAL_STAGE,
        "weight": 0.9,
    },
    "gift_bribery": {
        "patterns": [
            r"\bi(?:'ll| will|can) (?:buy|send|get) you\b",
            r"\b(?:gift card|money|cash|v-?bucks|robux)\b.*\b(?:send|give)\b",
            r"\bwant (?:a|an|some)\b.*\b(?:gift|present|phone|laptop)\b",
        ],
        "stage": GroomingStage.COMPLIANCE,
        "weight": 0.5,
    },
    "meeting_request": {
        "patterns": [
            r"\b(?:meet|see) (?:me |you )?(?:in person|irl|in real life)\b",
            r"\bwhere do you live\b",
            r"\bwhat(?:'s| is) your (?:address|school)\b",
            r"\bi(?:'m| am|live) (?:near|close to|in)\b.*\b(?:school|house|neighborhood)\b",
            r"\bcan (?:i|we) (?:meet|come|visit|pick you up)\b",
        ],
        "stage": GroomingStage.COMPLIANCE,
        "weight": 0.85,
    },
    "photo_request": {
        "patterns": [
            r"\bsend (?:me )?(?:a )?(?:pic|photo|selfie|image)\b",
            r"\bshow me\b.*\b(?:you|yourself|body|face)\b",
            r"\bturn on\b.*\b(?:cam|camera|video)\b",
            r"\blet me see\b",
        ],
        "stage": GroomingStage.SEXUAL_STAGE,
        "weight": 0.7,
    },
}


class GroomingDetectionService:
    """
    Multi-layer grooming detection system:
    Layer 1: Rule-based pattern matching (fast, explainable)
    Layer 2: Transformer-based classification (nuanced, contextual)
    Layer 3: Conversation-level analysis (multi-turn dynamics)
    """

    def __init__(self, settings, transformer_model=None):
        self._settings = settings
        self._transformer = transformer_model
        self._compiled_patterns = self._compile_patterns()

    def _compile_patterns(self) -> dict:
        compiled = {}
        for indicator_type, config in GROOMING_PATTERNS.items():
            compiled[indicator_type] = {
                "regexes": [re.compile(p, re.IGNORECASE) for p in config["patterns"]],
                "stage": config["stage"],
                "weight": config["weight"],
            }
        return compiled

    async def analyze_text(
        self,
        text: str,
        source_type: str = "chat",
        language: str = "en",
        context_messages: Optional[list[str]] = None,
    ) -> GroomingAnalysisResult:
        """
        Analyze a text segment for grooming indicators.
        Optionally include surrounding context messages for
        conversation-level analysis.
        """
        import hashlib
        import time

        start_time = time.monotonic()
        text_hash = hashlib.sha256(text.encode()).hexdigest()

        # ── Layer 1: Rule-based pattern detection ────────────────────
        rule_indicators = self._detect_patterns(text)

        # ── Layer 2: Transformer classification ──────────────────────
        transformer_scores = {}
        if self._transformer:
            transformer_scores = await self._run_transformer(text)

        # ── Layer 3: Conversation-level analysis ─────────────────────
        conversation_risk = 0.0
        if context_messages:
            conversation_risk = await self._analyze_conversation_dynamics(
                context_messages + [text]
            )

        # ── Composite scoring ────────────────────────────────────────
        rule_score = self._compute_rule_score(rule_indicators)
        ml_score = transformer_scores.get("grooming_probability", 0.0)
        stage_scores = transformer_scores.get("stage_scores", {})

        # Weighted combination: ML model has higher weight if available
        if self._transformer:
            composite_score = (
                0.25 * rule_score
                + 0.50 * ml_score
                + 0.25 * conversation_risk
            )
        else:
            composite_score = (
                0.70 * rule_score
                + 0.30 * conversation_risk
            )

        composite_score = min(1.0, max(0.0, composite_score))

        # Determine risk level and dominant stage
        risk_level = self._score_to_risk_level(composite_score)
        dominant_stage = self._determine_dominant_stage(rule_indicators, stage_scores)

        flagged = [ind.text_span for ind in rule_indicators if ind.confidence > 0.5]

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        return GroomingAnalysisResult(
            text_hash=text_hash,
            risk_level=risk_level,
            risk_score=composite_score,
            stage_detected=dominant_stage,
            stage_scores=stage_scores,
            indicators=rule_indicators,
            flagged_phrases=flagged,
            language=language,
            model_name="grooming_detector",
            model_version="v2_hybrid",
            processing_time_ms=elapsed_ms,
        )

    async def analyze_conversation(
        self,
        messages: list[dict],
        participants: Optional[list[str]] = None,
    ) -> list[GroomingAnalysisResult]:
        """
        Analyze an entire conversation for grooming patterns.
        Messages should be [{\"sender\": ..., \"text\": ..., \"timestamp\": ...}].
        Returns per-message analysis with conversation context.
        """
        results = []
        for i, msg in enumerate(messages):
            context = [m["text"] for m in messages[max(0, i - 10):i]]
            result = await self.analyze_text(
                text=msg["text"],
                context_messages=context if context else None,
            )
            results.append(result)
        return results

    # ── Internal methods ─────────────────────────────────────────────

    def _detect_patterns(self, text: str) -> list[GroomingIndicator]:
        """Layer 1: Rule-based pattern detection."""
        indicators = []
        for indicator_type, config in self._compiled_patterns.items():
            for regex in config["regexes"]:
                for match in regex.finditer(text):
                    indicators.append(GroomingIndicator(
                        indicator_type=indicator_type,
                        text_span=match.group(0),
                        start_offset=match.start(),
                        end_offset=match.end(),
                        confidence=config["weight"],
                        stage=config["stage"],
                    ))
        return indicators

    async def _run_transformer(self, text: str) -> dict:
        """Layer 2: Transformer-based grooming classification."""
        output = await self._transformer.predict(text)
        return {
            "grooming_probability": float(output["grooming_score"]),
            "stage_scores": {
                stage.value: float(output.get(f"stage_{stage.value}", 0.0))
                for stage in GroomingStage
            },
        }

    async def _analyze_conversation_dynamics(self, messages: list[str]) -> float:
        """
        Layer 3: Analyze multi-turn conversation patterns.
        Detects escalation, power dynamics, and temporal patterns.
        """
        if len(messages) < 3:
            return 0.0

        # Check for escalation pattern: increasing risk scores over time
        scores = []
        for msg in messages[-10:]:
            indicators = self._detect_patterns(msg)
            score = self._compute_rule_score(indicators)
            scores.append(score)

        if len(scores) < 2:
            return 0.0

        # Detect upward trend (escalation)
        diffs = [scores[i + 1] - scores[i] for i in range(len(scores) - 1)]
        positive_diffs = sum(1 for d in diffs if d > 0)
        escalation = positive_diffs / len(diffs) if diffs else 0

        avg_score = sum(scores) / len(scores)
        return min(1.0, avg_score * 0.6 + escalation * 0.4)

    def _compute_rule_score(self, indicators: list[GroomingIndicator]) -> float:
        """Compute composite score from rule-based indicators."""
        if not indicators:
            return 0.0
        weights = [ind.confidence for ind in indicators]
        # Diminishing returns for multiple indicators of same type
        seen_types: dict[str, float] = {}
        weighted_sum = 0.0
        for ind in indicators:
            type_key = ind.indicator_type
            if type_key in seen_types:
                # Reduce weight for repeated indicators of same type
                weighted_sum += ind.confidence * 0.3
            else:
                weighted_sum += ind.confidence
                seen_types[type_key] = ind.confidence

        # Normalize: more diverse indicators = higher risk
        diversity_bonus = min(0.2, len(seen_types) * 0.05)
        score = min(1.0, (weighted_sum / max(len(GROOMING_PATTERNS), 1)) + diversity_bonus)
        return score

    def _score_to_risk_level(self, score: float) -> RiskLevel:
        if score >= 0.85:
            return RiskLevel.CRITICAL
        if score >= 0.65:
            return RiskLevel.HIGH
        if score >= 0.40:
            return RiskLevel.MEDIUM
        if score >= 0.15:
            return RiskLevel.LOW
        return RiskLevel.NONE

    def _determine_dominant_stage(
        self,
        indicators: list[GroomingIndicator],
        stage_scores: dict[str, float],
    ) -> Optional[GroomingStage]:
        """Determine the most prominent grooming stage."""
        # Combine rule-based and ML stage evidence
        combined: dict[str, float] = {}
        for ind in indicators:
            if ind.stage:
                combined[ind.stage.value] = combined.get(ind.stage.value, 0) + ind.confidence

        for stage_name, score in stage_scores.items():
            combined[stage_name] = combined.get(stage_name, 0) + score

        if not combined:
            return None

        best_stage = max(combined, key=combined.get)
        if combined[best_stage] < 0.2:
            return None
        return GroomingStage(best_stage)
