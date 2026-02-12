"""
Mary Poppins — AI Classifier Worker
ONNX-based content classification: NSFW detection, age estimation, scene analysis.
Zero Visual Exposure — processes feature vectors only, never stores raw imagery.
"""

from __future__ import annotations

import logging
import os
import time

from workers.celery_app import app

logger = logging.getLogger("mp.worker.classifier")

# Model paths from environment
NSFW_MODEL = os.getenv("MP_CLASSIFIER_NSFW_MODEL_PATH", "/models/nsfw_detector_v3.onnx")
AGE_MODEL = os.getenv("MP_CLASSIFIER_AGE_MODEL_PATH", "/models/age_estimator_v2.onnx")
DEVICE = os.getenv("MP_CLASSIFIER_DEVICE", "cpu")
CONFIDENCE_THRESHOLD = float(os.getenv("MP_CLASSIFIER_CONFIDENCE_THRESHOLD", "0.7"))
CSAM_ALERT_THRESHOLD = float(os.getenv("MP_CLASSIFIER_CSAM_ALERT_THRESHOLD", "0.85"))


@app.task(name="workers.classifier.classify_content", bind=True, max_retries=2)
def classify_content(self, submission_id: str, metadata: dict) -> dict:
    """
    Run AI classification pipeline on content submission.
    Returns scores only — raw content is never persisted.
    """
    start = time.monotonic()
    logger.info("Classifying submission %s on %s", submission_id, DEVICE)

    try:
        # Run NSFW detection
        nsfw_scores = run_nsfw_model(metadata)

        # Run age estimation
        age_scores = run_age_model(metadata)

        # Determine alert level
        max_score = max(nsfw_scores.values()) if nsfw_scores else 0.0
        alert_level = "critical" if max_score >= CSAM_ALERT_THRESHOLD else \
                      "high" if max_score >= CONFIDENCE_THRESHOLD else "low"

        result = {
            "submission_id": submission_id,
            "nsfw_scores": nsfw_scores,
            "age_estimation": age_scores,
            "alert_level": alert_level,
            "max_confidence": max_score,
            "device": DEVICE,
            "elapsed_ms": int((time.monotonic() - start) * 1000),
        }

        # Critical alert — immediate escalation
        if alert_level == "critical":
            logger.warning("CRITICAL ALERT: submission %s scored %.3f", submission_id, max_score)
            app.send_task(
                "workers.ingestion.process_submission",
                kwargs={"submission_id": submission_id, "metadata": {**metadata, "alert": "critical"}},
                queue="ingestion",
            )

        return result

    except Exception as exc:
        logger.error("Classification failed for %s: %s", submission_id, exc)
        raise self.retry(exc=exc, countdown=5)


def run_nsfw_model(metadata: dict) -> dict:
    """Run NSFW detection model. Stub — would load ONNX and run inference."""
    # In production: onnxruntime.InferenceSession(NSFW_MODEL)
    return {
        "explicit_sexual": 0.0,
        "suggestive": 0.0,
        "violence_graphic": 0.0,
        "safe": 1.0,
    }


def run_age_model(metadata: dict) -> dict:
    """Run age estimation model. Stub — would load ONNX and run inference."""
    return {
        "estimated_age": None,
        "is_minor_probability": 0.0,
        "confidence": 0.0,
    }
