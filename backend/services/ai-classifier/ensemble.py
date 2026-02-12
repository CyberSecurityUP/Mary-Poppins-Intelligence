"""
Mary Poppins — Ensemble Classifier
Combines outputs from multiple models for the same task using weighted voting.

When multiple models classify the same content (e.g., NSFW detection),
the ensemble produces a unified result with:
- Aggregated scores per category
- Agreement metric across models
- Per-model breakdown for transparency

SAFETY: Operates on classification scores only. Never touches raw content.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .model_registry import ModelDescriptor, ModelRegistry
from .preprocessing import PreprocessingAdapter

logger = logging.getLogger("mp.ensemble")


# ---------------------------------------------------------------------------
# Category mapping — normalize model outputs to common categories
# ---------------------------------------------------------------------------

# The canonical NSFW categories used across the platform
CANONICAL_NSFW_CATEGORIES = [
    "explicit_sexual", "suggestive", "violence_graphic",
    "violence_mild", "drugs", "safe",
]

# Maps model-specific categories -> canonical categories with weights
CATEGORY_MAPPINGS: dict[str, dict[str, list[tuple[str, float]]]] = {
    "yahoo_open_nsfw": {
        "nsfw": [("explicit_sexual", 0.7), ("suggestive", 0.3)],
        "sfw": [("safe", 1.0)],
    },
    "nudenet_v3": {
        "female_genitalia_exposed": [("explicit_sexual", 1.0)],
        "male_genitalia_exposed": [("explicit_sexual", 1.0)],
        "female_genitalia_covered": [("suggestive", 0.8)],
        "buttocks_exposed": [("explicit_sexual", 0.8), ("suggestive", 0.2)],
        "female_breast_exposed": [("explicit_sexual", 0.9), ("suggestive", 0.1)],
        "female_breast_covered": [("suggestive", 1.0)],
        "anus_exposed": [("explicit_sexual", 1.0)],
        "belly_exposed": [("suggestive", 0.5), ("safe", 0.5)],
        "feet_exposed": [("safe", 1.0)],
        "armpits_exposed": [("safe", 1.0)],
        "face_male": [("safe", 1.0)],
        "face_female": [("safe", 1.0)],
        "safe": [("safe", 1.0)],
    },
    "clip_safety": {
        "unsafe": [("explicit_sexual", 0.4), ("suggestive", 0.3), ("violence_graphic", 0.3)],
        "safe": [("safe", 1.0)],
    },
}


# ---------------------------------------------------------------------------
# Ensemble result
# ---------------------------------------------------------------------------

@dataclass
class EnsembleResult:
    """Result from ensemble classification."""
    task: str
    final_scores: dict[str, float]
    model_results: list[dict[str, Any]]
    agreement_score: float        # 0.0 (total disagreement) – 1.0 (all agree)
    method: str                   # "weighted_average" | "majority_vote" | "max_confidence"


# ---------------------------------------------------------------------------
# Ensemble classifier
# ---------------------------------------------------------------------------

class EnsembleClassifier:
    """Combines outputs from multiple models for the same task.

    Supports three aggregation methods:
    - weighted_average: Weight each model's scores by its configured weight
    - majority_vote: Binary vote per model, majority wins
    - max_confidence: Take scores from the most confident model
    """

    def __init__(self, registry: ModelRegistry) -> None:
        self._registry = registry

    async def classify_ensemble(
        self,
        content: bytes,
        task: str,
        method: str = "weighted_average",
    ) -> EnsembleResult:
        """
        Run all enabled models for a task and combine their results.

        Args:
            content: Raw image bytes (processed in memory only).
            task: Classification task (e.g., "nsfw_detection").
            method: Aggregation method.

        Returns:
            Ensemble result with aggregated scores and per-model breakdown.
        """
        models = self._registry.get_models_for_task(task)
        if not models:
            logger.warning("No enabled models for task: %s", task)
            return EnsembleResult(
                task=task,
                final_scores={},
                model_results=[],
                agreement_score=1.0,
                method=method,
            )

        model_results: list[dict[str, Any]] = []

        for descriptor in models:
            if not descriptor.loaded:
                logger.debug("Skipping unloaded model: %s", descriptor.model_id)
                continue

            try:
                preprocessed = PreprocessingAdapter.preprocess(
                    content, descriptor.input_size, descriptor.preprocessing,
                )
                raw_output = await self._registry.predict(descriptor.model_id, preprocessed)

                scores = {}
                for i, category in enumerate(descriptor.categories):
                    if i < len(raw_output):
                        scores[category] = float(raw_output[i])

                model_results.append({
                    "model_id": descriptor.model_id,
                    "model_name": descriptor.name,
                    "version": descriptor.version,
                    "weight": descriptor.weight,
                    "raw_scores": scores,
                    "normalized_scores": self._normalize_scores(
                        descriptor.model_id, scores,
                    ),
                })
            except Exception as exc:
                logger.error(
                    "Ensemble: model %s failed: %s", descriptor.model_id, exc,
                )

        if not model_results:
            return EnsembleResult(
                task=task,
                final_scores={},
                model_results=[],
                agreement_score=0.0,
                method=method,
            )

        if method == "weighted_average":
            final_scores = self._weighted_average(model_results)
        elif method == "majority_vote":
            final_scores = self._majority_vote(model_results)
        elif method == "max_confidence":
            final_scores = self._max_confidence(model_results)
        else:
            final_scores = self._weighted_average(model_results)

        agreement = self._compute_agreement(model_results)

        logger.info(
            "Ensemble: task=%s models=%d method=%s agreement=%.2f top=%s",
            task, len(model_results), method, agreement,
            max(final_scores, key=final_scores.get) if final_scores else "none",
        )

        return EnsembleResult(
            task=task,
            final_scores=final_scores,
            model_results=model_results,
            agreement_score=agreement,
            method=method,
        )

    def _normalize_scores(
        self,
        model_id: str,
        raw_scores: dict[str, float],
    ) -> dict[str, float]:
        """Normalize model-specific scores to canonical categories."""
        mapping = CATEGORY_MAPPINGS.get(model_id)
        if mapping is None:
            return raw_scores

        normalized: dict[str, float] = {cat: 0.0 for cat in CANONICAL_NSFW_CATEGORIES}

        for category, score in raw_scores.items():
            targets = mapping.get(category, [])
            for target_cat, weight in targets:
                if target_cat in normalized:
                    normalized[target_cat] = max(normalized[target_cat], score * weight)

        return normalized

    def _weighted_average(
        self, model_results: list[dict[str, Any]],
    ) -> dict[str, float]:
        """Compute weighted average across all models."""
        all_categories = set()
        for result in model_results:
            all_categories.update(result["normalized_scores"].keys())

        final: dict[str, float] = {}
        total_weight = sum(r["weight"] for r in model_results)

        for category in all_categories:
            weighted_sum = sum(
                r["normalized_scores"].get(category, 0.0) * r["weight"]
                for r in model_results
            )
            final[category] = weighted_sum / total_weight if total_weight > 0 else 0.0

        return final

    def _majority_vote(
        self, model_results: list[dict[str, Any]],
    ) -> dict[str, float]:
        """Majority vote -- each model's top category gets 1 vote."""
        votes: dict[str, int] = {}
        for result in model_results:
            scores = result["normalized_scores"]
            if scores:
                top = max(scores, key=scores.get)
                votes[top] = votes.get(top, 0) + 1

        total_votes = len(model_results)
        return {cat: count / total_votes for cat, count in votes.items()}

    def _max_confidence(
        self, model_results: list[dict[str, Any]],
    ) -> dict[str, float]:
        """Take scores from the single most confident model."""
        best_result = None
        best_confidence = -1.0

        for result in model_results:
            scores = result["normalized_scores"]
            max_score = max(scores.values()) if scores else 0.0
            if max_score > best_confidence:
                best_confidence = max_score
                best_result = result

        return best_result["normalized_scores"] if best_result else {}

    @staticmethod
    def _compute_agreement(model_results: list[dict[str, Any]]) -> float:
        """Compute agreement score across models.

        Uses the standard deviation of per-model top scores.
        Low std -> high agreement, high std -> low agreement.
        """
        if len(model_results) <= 1:
            return 1.0

        top_categories = []
        for result in model_results:
            scores = result["normalized_scores"]
            if scores:
                top_categories.append(max(scores, key=scores.get))

        if not top_categories:
            return 0.0

        all_same = all(c == top_categories[0] for c in top_categories)
        if all_same:
            top_scores = [
                max(r["normalized_scores"].values())
                for r in model_results
                if r["normalized_scores"]
            ]
            if top_scores:
                std = float(np.std(top_scores))
                return max(0.0, min(1.0, 1.0 - std))
            return 1.0

        agreement_ratio = max(
            top_categories.count(c) for c in set(top_categories)
        ) / len(top_categories)

        return agreement_ratio
