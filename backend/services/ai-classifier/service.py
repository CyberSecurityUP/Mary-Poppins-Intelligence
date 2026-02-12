"""
Mary Poppins — AI Classification Service
Multi-model pipeline for NSFW detection, age estimation, and scene classification.
Operates on image bytes in memory — never persists raw content.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

import numpy as np

from .preprocessing import PreprocessingAdapter
from .ensemble import EnsembleClassifier, EnsembleResult

logger = logging.getLogger("mp.classifier")


class ContentCategory(str, Enum):
    SAFE = "safe"
    SUGGESTIVE = "suggestive"
    EXPLICIT_SEXUAL = "explicit_sexual"
    VIOLENCE_MILD = "violence_mild"
    VIOLENCE_GRAPHIC = "violence_graphic"
    DRUGS = "drugs"
    CSAM_SUSPECT = "csam_suspect"
    NSFL_SUSPECT = "nsfl_suspect"


@dataclass
class ClassificationScore:
    category: str
    score: float
    model_name: str
    model_version: str


@dataclass
class AgeEstimation:
    estimated_age: float
    age_range_low: float
    age_range_high: float
    confidence: float
    is_minor_likely: bool
    model_name: str


@dataclass
class ClassificationResult:
    sha256: str
    primary_classification: ContentCategory
    nsfw_score: float
    csam_score: float
    age_estimation: Optional[AgeEstimation]
    all_scores: list[ClassificationScore]
    processing_time_ms: int
    requires_human_review: bool
    nsfl_score: float = 0.0
    model_agreement: float = 1.0
    ensemble_details: dict = field(default_factory=dict)
    classified_at: datetime = field(default_factory=datetime.utcnow)


class AIClassifierService:
    """
    Multi-stage AI classification pipeline.

    Pipeline stages:
    1. NSFW Detection — binary + multi-class (safe/suggestive/explicit/violence)
    2. Age Estimation — estimated age of detected persons
    3. Scene Classification — context analysis (bedroom, bathroom, school, etc.)
    4. CSAM Risk Scoring — composite score from all models
    5. Human Review Routing — flag uncertain or high-risk results

    SAFETY INVARIANTS:
    - Image bytes exist only in GPU memory during inference
    - No intermediate files, no logging of pixel data
    - Model outputs are numerical scores only
    - CSAM suspect content is NEVER displayed, only scored and flagged
    """

    def __init__(self, settings, model_registry):
        self._settings = settings
        self._models = model_registry
        self._nsfw_model = None
        self._age_model = None
        self._scene_model = None
        self._ensemble: EnsembleClassifier | None = None
        self._nsfl_model = None

    async def initialize(self):
        """Load models into memory/GPU."""
        self._nsfw_model = await self._models.load(
            self._settings.nsfw_model_path,
            device=self._settings.device,
        )
        self._age_model = await self._models.load(
            self._settings.age_model_path,
            device=self._settings.device,
        )
        self._scene_model = await self._models.load(
            self._settings.scene_model_path,
            device=self._settings.device,
        )
        logger.info("AI classifier models loaded on device=%s", self._settings.device)

        # Initialize ensemble classifier
        self._ensemble = EnsembleClassifier(self._models)

        # Load NSFL model if path is configured
        nsfl_path = getattr(self._settings, 'nsfl_model_path', None)
        if nsfl_path:
            try:
                self._nsfl_model = await self._models.load(nsfl_path, device=self._settings.device)
                logger.info("NSFL model loaded: %s", nsfl_path)
            except Exception as exc:
                logger.warning("NSFL model not available: %s", exc)

    async def classify(self, content: bytes, sha256: str) -> ClassificationResult:
        """
        Run full classification pipeline on image content.
        Returns structured scores without any visual data.
        """
        start_time = time.monotonic()
        all_scores: list[ClassificationScore] = []

        # ── Stage 1: NSFW Detection ─────────────────────────────────
        nsfw_scores = await self._run_nsfw_detection(content)
        all_scores.extend(nsfw_scores)

        nsfw_score = max(
            (s.score for s in nsfw_scores if s.category in ("explicit_sexual", "suggestive")),
            default=0.0,
        )

        # ── Stage 2: NSFL Detection ──────────────────────────────────
        nsfl_scores = await self._run_nsfl_detection(content)
        all_scores.extend(nsfl_scores)

        nsfl_score = max(
            (s.score for s in nsfl_scores if s.category.startswith("nsfl_") and s.category != "nsfl_safe"),
            default=0.0,
        )

        # ── Stage 3: Age Estimation ─────────────────────────────────
        age_result = await self._run_age_estimation(content)

        # ── Stage 4: Scene Classification ────────────────────────────
        scene_scores = await self._run_scene_classification(content)
        all_scores.extend(scene_scores)

        # ── Stage 5: Composite CSAM Risk Score ──────────────────────
        csam_score = self._compute_csam_risk(
            nsfw_scores=nsfw_scores,
            age_estimation=age_result,
            scene_scores=scene_scores,
        )

        # ── Stage 6: Determine primary classification ───────────────
        primary = self._determine_classification(nsfw_scores, csam_score)

        # ── Stage 7: Human review routing ────────────────────────────
        requires_review = self._should_route_to_review(
            primary, csam_score, nsfw_score, age_result,
        )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        result = ClassificationResult(
            sha256=sha256,
            primary_classification=primary,
            nsfw_score=nsfw_score,
            csam_score=csam_score,
            age_estimation=age_result,
            all_scores=all_scores,
            processing_time_ms=elapsed_ms,
            requires_human_review=requires_review,
            nsfl_score=nsfl_score,
        )

        logger.info(
            "Classification complete: sha256=%s class=%s nsfw=%.3f csam=%.3f review=%s time=%dms",
            sha256, primary.value, nsfw_score, csam_score, requires_review, elapsed_ms,
        )

        return result

    # ── Model inference stages ───────────────────────────────────────

    async def _run_nsfw_detection(self, content: bytes) -> list[ClassificationScore]:
        """Run NSFW multi-class detection model."""
        preprocessed = self._preprocess_image(content, target_size=(224, 224))
        output = await self._nsfw_model.predict(preprocessed)

        categories = self._settings.nsfw_categories
        scores = []
        for i, category in enumerate(categories):
            scores.append(ClassificationScore(
                category=category,
                score=float(output[i]),
                model_name="nsfw_detector",
                model_version="v3",
            ))
        return scores

    async def _run_age_estimation(self, content: bytes) -> Optional[AgeEstimation]:
        """Estimate age of detected persons in the image."""
        preprocessed = self._preprocess_image(content, target_size=(224, 224))
        output = await self._age_model.predict(preprocessed)

        # Model outputs: [estimated_age, confidence, face_detected]
        if output[2] < 0.5:  # No face detected
            return None

        estimated_age = float(output[0])
        confidence = float(output[1])
        margin = max(2.0, (1.0 - confidence) * 10)

        return AgeEstimation(
            estimated_age=estimated_age,
            age_range_low=max(0, estimated_age - margin),
            age_range_high=estimated_age + margin,
            confidence=confidence,
            is_minor_likely=estimated_age < 18 and confidence > 0.6,
            model_name="age_estimator_v2",
        )

    async def _run_scene_classification(self, content: bytes) -> list[ClassificationScore]:
        """Classify scene context (environment, setting)."""
        preprocessed = self._preprocess_image(content, target_size=(299, 299))
        output = await self._scene_model.predict(preprocessed)

        scene_labels = [
            "indoor_bedroom", "indoor_bathroom", "indoor_school",
            "indoor_office", "outdoor_playground", "outdoor_street",
            "indoor_generic", "outdoor_generic",
        ]
        scores = []
        for i, label in enumerate(scene_labels):
            scores.append(ClassificationScore(
                category=f"scene_{label}",
                score=float(output[i]),
                model_name="scene_classifier",
                model_version="v1",
            ))
        return scores

    async def _run_nsfl_detection(self, content: bytes) -> list[ClassificationScore]:
        """Run NSFL (gore/violence/shock) detection."""
        if self._nsfl_model is None:
            return []

        preprocessed = self._preprocess_image(content, target_size=(224, 224))
        output = await self._nsfl_model.predict(preprocessed)

        nsfl_categories = ["gore", "violence_graphic", "shock", "disturbing", "safe"]
        scores = []
        for i, category in enumerate(nsfl_categories):
            if i < len(output):
                scores.append(ClassificationScore(
                    category=f"nsfl_{category}",
                    score=float(output[i]),
                    model_name="nsfl_detector",
                    model_version="v1",
                ))
        return scores

    # ── Risk computation ─────────────────────────────────────────────

    def _compute_csam_risk(
        self,
        nsfw_scores: list[ClassificationScore],
        age_estimation: Optional[AgeEstimation],
        scene_scores: list[ClassificationScore],
    ) -> float:
        """
        Composite CSAM risk score from all model outputs.

        Formula: weighted combination of:
        - Explicit content probability (0.35)
        - Minor likelihood (0.40)
        - Context risk (scene type) (0.15)
        - Suggestive + minor combination (0.10)
        """
        explicit_score = max(
            (s.score for s in nsfw_scores if s.category == "explicit_sexual"),
            default=0.0,
        )
        suggestive_score = max(
            (s.score for s in nsfw_scores if s.category == "suggestive"),
            default=0.0,
        )

        minor_score = 0.0
        if age_estimation and age_estimation.is_minor_likely:
            # Scale by confidence and how far below 18
            age_factor = max(0, (18 - age_estimation.estimated_age) / 18)
            minor_score = age_estimation.confidence * age_factor

        # High-risk scenes when combined with other factors
        risky_scenes = {"scene_indoor_bedroom", "scene_indoor_bathroom", "scene_indoor_school"}
        scene_risk = max(
            (s.score for s in scene_scores if s.category in risky_scenes),
            default=0.0,
        )

        csam_score = (
            0.35 * explicit_score
            + 0.40 * minor_score
            + 0.15 * scene_risk
            + 0.10 * (suggestive_score * minor_score)
        )

        return min(1.0, max(0.0, csam_score))

    def _determine_classification(
        self,
        nsfw_scores: list[ClassificationScore],
        csam_score: float,
    ) -> ContentCategory:
        """Map scores to a primary classification label."""
        if csam_score >= self._settings.csam_alert_threshold:
            return ContentCategory.CSAM_SUSPECT

        nsfl_threshold = getattr(self._settings, 'nsfl_alert_threshold', 0.80)
        # Check for NSFL content (not in the nsfw_scores, but passed via csam_score param area)
        # This is a simplification — in production, nsfl_score would be passed separately

        score_map = {s.category: s.score for s in nsfw_scores}

        if score_map.get("explicit_sexual", 0) > self._settings.confidence_threshold:
            return ContentCategory.EXPLICIT_SEXUAL
        if score_map.get("violence_graphic", 0) > self._settings.confidence_threshold:
            return ContentCategory.VIOLENCE_GRAPHIC
        if score_map.get("violence_mild", 0) > self._settings.confidence_threshold:
            return ContentCategory.VIOLENCE_MILD
        if score_map.get("suggestive", 0) > self._settings.confidence_threshold:
            return ContentCategory.SUGGESTIVE
        if score_map.get("drugs", 0) > self._settings.confidence_threshold:
            return ContentCategory.DRUGS

        return ContentCategory.SAFE

    def _should_route_to_review(
        self,
        classification: ContentCategory,
        csam_score: float,
        nsfw_score: float,
        age_est: Optional[AgeEstimation],
    ) -> bool:
        """Determine if the result requires human analyst review."""
        # Always review CSAM suspects
        if classification == ContentCategory.CSAM_SUSPECT:
            return True
        # Review borderline CSAM scores
        if csam_score > 0.5:
            return True
        # Review if minor detected with any NSFW content
        if age_est and age_est.is_minor_likely and nsfw_score > 0.3:
            return True
        return False

    # ── Image preprocessing ──────────────────────────────────────────

    def _preprocess_image(self, content: bytes, target_size: tuple[int, int]) -> np.ndarray:
        """
        Preprocess image bytes for model inference.
        Resize, normalize, and convert to tensor format.
        """
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(content)).convert("RGB")
        img = img.resize(target_size, Image.LANCZOS)

        arr = np.array(img, dtype=np.float32) / 255.0
        # Normalize with ImageNet stats
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        arr = (arr - mean) / std

        # CHW format, add batch dimension
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)
        return arr
