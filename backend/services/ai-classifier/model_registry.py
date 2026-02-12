"""
Mary Poppins — AI Model Registry
Manages detection models with metadata, lifecycle, and health monitoring.
Supports ONNX, PyTorch, and API-backed models.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import numpy as np

logger = logging.getLogger("mp.model_registry")


# ---------------------------------------------------------------------------
# Model descriptor
# ---------------------------------------------------------------------------

@dataclass
class ModelDescriptor:
    """Metadata for a registered detection model."""
    model_id: str
    name: str
    version: str
    model_type: str                    # "onnx" | "pytorch" | "api"
    task: str                          # "nsfw_detection" | "nsfl_detection" | "age_estimation" | "scene_classification"
    input_size: tuple[int, int]        # (height, width)
    preprocessing: str                 # "imagenet" | "caffe" | "raw_0_1" | "clip"
    categories: list[str]
    weight: float                      # ensemble weight 0.0–1.0
    enabled: bool
    model_path: str
    source_url: str                    # provenance URL (empty for proprietary)
    license: str                       # "BSD-2-Clause", "Apache-2.0", "Proprietary", etc.
    loaded: bool = False
    total_inferences: int = 0
    avg_latency_ms: float = 0.0
    last_inference: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Built-in model catalog
# ---------------------------------------------------------------------------

BUILTIN_MODELS: list[ModelDescriptor] = [
    ModelDescriptor(
        model_id="nsfw_detector_v3",
        name="Internal NSFW Detector",
        version="v3",
        model_type="onnx",
        task="nsfw_detection",
        input_size=(224, 224),
        preprocessing="imagenet",
        categories=[
            "explicit_sexual", "suggestive", "violence_graphic",
            "violence_mild", "drugs", "safe",
        ],
        weight=0.30,
        enabled=True,
        model_path="/models/nsfw_detector_v3.onnx",
        source_url="",
        license="Proprietary",
    ),
    ModelDescriptor(
        model_id="yahoo_open_nsfw",
        name="Yahoo Open NSFW",
        version="1.0",
        model_type="onnx",
        task="nsfw_detection",
        input_size=(224, 224),
        preprocessing="caffe",
        categories=["nsfw", "sfw"],
        weight=0.30,
        enabled=True,
        model_path="/models/yahoo_open_nsfw.onnx",
        source_url="https://github.com/yahoo/open_nsfw",
        license="BSD-2-Clause",
    ),
    ModelDescriptor(
        model_id="nudenet_v3",
        name="NudeNet v3",
        version="v3",
        model_type="onnx",
        task="nsfw_detection",
        input_size=(320, 320),
        preprocessing="raw_0_1",
        categories=[
            "safe", "female_genitalia_covered", "female_genitalia_exposed",
            "male_genitalia_exposed", "buttocks_exposed",
            "female_breast_exposed", "female_breast_covered",
            "anus_exposed", "belly_exposed", "feet_exposed",
            "armpits_exposed", "face_male", "face_female",
        ],
        weight=0.25,
        enabled=True,
        model_path="/models/nudenet_v3.onnx",
        source_url="https://github.com/notAI-tech/NudeNet",
        license="Apache-2.0",
    ),
    ModelDescriptor(
        model_id="clip_safety",
        name="CLIP Safety Classifier",
        version="1.0",
        model_type="onnx",
        task="nsfw_detection",
        input_size=(224, 224),
        preprocessing="clip",
        categories=["unsafe", "safe"],
        weight=0.15,
        enabled=False,
        model_path="/models/clip_safety.onnx",
        source_url="https://github.com/LAION-AI/CLIP-based-NSFW-Detector",
        license="MIT",
    ),
    ModelDescriptor(
        model_id="nsfl_detector_v1",
        name="NSFL Detector",
        version="v1",
        model_type="onnx",
        task="nsfl_detection",
        input_size=(224, 224),
        preprocessing="imagenet",
        categories=["gore", "violence_graphic", "shock", "disturbing", "safe"],
        weight=1.0,
        enabled=True,
        model_path="/models/nsfl_detector_v1.onnx",
        source_url="",
        license="Proprietary",
    ),
    ModelDescriptor(
        model_id="age_estimator_v2",
        name="Age Estimator",
        version="v2",
        model_type="onnx",
        task="age_estimation",
        input_size=(224, 224),
        preprocessing="imagenet",
        categories=[],
        weight=1.0,
        enabled=True,
        model_path="/models/age_estimator_v2.onnx",
        source_url="",
        license="Proprietary",
    ),
    ModelDescriptor(
        model_id="scene_classifier_v1",
        name="Scene Classifier",
        version="v1",
        model_type="onnx",
        task="scene_classification",
        input_size=(299, 299),
        preprocessing="imagenet",
        categories=[
            "indoor_bedroom", "indoor_bathroom", "indoor_school",
            "indoor_office", "outdoor_playground", "outdoor_street",
            "indoor_generic", "outdoor_generic",
        ],
        weight=1.0,
        enabled=True,
        model_path="/models/scene_classifier_v1.onnx",
        source_url="",
        license="Proprietary",
    ),
]


# ---------------------------------------------------------------------------
# Model Registry
# ---------------------------------------------------------------------------

class ModelRegistry:
    """
    Central registry for AI classification models.

    Manages model lifecycle (registration, loading, unloading),
    inference dispatching, and performance tracking.

    SAFETY INVARIANT: Models operate on in-memory numpy arrays only.
    No intermediate files are created during inference.
    """

    def __init__(self) -> None:
        self._models: dict[str, ModelDescriptor] = {}
        self._sessions: dict[str, Any] = {}  # ONNX InferenceSessions

    def register(self, descriptor: ModelDescriptor) -> None:
        """Register a model descriptor."""
        self._models[descriptor.model_id] = descriptor
        logger.info(
            "Registered model: %s (%s) task=%s weight=%.2f",
            descriptor.model_id, descriptor.name, descriptor.task, descriptor.weight,
        )

    def register_builtins(self) -> None:
        """Register all built-in models from the catalog."""
        for descriptor in BUILTIN_MODELS:
            self.register(descriptor)
        logger.info("Registered %d built-in models", len(BUILTIN_MODELS))

    async def load_model(self, model_id: str, device: str = "cpu") -> None:
        """Load a model into memory for inference."""
        if model_id not in self._models:
            raise ValueError(f"Unknown model: {model_id}")

        descriptor = self._models[model_id]
        if descriptor.model_type == "onnx":
            import onnxruntime as ort

            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda" else ["CPUExecutionProvider"]
            session = ort.InferenceSession(descriptor.model_path, providers=providers)
            self._sessions[model_id] = session
            descriptor.loaded = True
            logger.info("Loaded model: %s on device=%s", model_id, device)
        else:
            logger.warning("Model type %s not yet supported for loading", descriptor.model_type)

    async def load(self, model_path: str, device: str = "cpu") -> Any:
        """Legacy loader — load by path and return a session-like object.

        Maintains backward compatibility with the existing AIClassifierService
        which calls ``self._models.load(path, device=device)``.
        """
        import onnxruntime as ort

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda" else ["CPUExecutionProvider"]
        session = ort.InferenceSession(model_path, providers=providers)

        class _SessionWrapper:
            def __init__(self, sess: ort.InferenceSession) -> None:
                self._sess = sess

            async def predict(self, input_tensor: np.ndarray) -> np.ndarray:
                input_name = self._sess.get_inputs()[0].name
                output = self._sess.run(None, {input_name: input_tensor})
                return output[0][0]

        return _SessionWrapper(session)

    async def unload_model(self, model_id: str) -> None:
        """Unload a model from memory."""
        if model_id in self._sessions:
            del self._sessions[model_id]
        if model_id in self._models:
            self._models[model_id].loaded = False
        logger.info("Unloaded model: %s", model_id)

    async def predict(self, model_id: str, input_tensor: np.ndarray) -> np.ndarray:
        """Run inference on a loaded model."""
        if model_id not in self._sessions:
            raise RuntimeError(f"Model {model_id} is not loaded")

        session = self._sessions[model_id]
        descriptor = self._models[model_id]

        start = time.monotonic()

        if descriptor.model_type == "onnx":
            input_name = session.get_inputs()[0].name
            output = session.run(None, {input_name: input_tensor})
            result = output[0][0]  # First output, first batch item
        else:
            raise RuntimeError(f"Unsupported model type: {descriptor.model_type}")

        elapsed_ms = (time.monotonic() - start) * 1000

        # Update stats
        descriptor.total_inferences += 1
        descriptor.avg_latency_ms = (
            (descriptor.avg_latency_ms * (descriptor.total_inferences - 1) + elapsed_ms)
            / descriptor.total_inferences
        )
        descriptor.last_inference = datetime.utcnow()

        return result

    def get_models_for_task(self, task: str) -> list[ModelDescriptor]:
        """Get all enabled models for a given task."""
        return [
            m for m in self._models.values()
            if m.task == task and m.enabled
        ]

    def list_models(
        self,
        task: str | None = None,
        enabled_only: bool = True,
    ) -> list[ModelDescriptor]:
        """List models with optional filtering."""
        models = list(self._models.values())
        if task:
            models = [m for m in models if m.task == task]
        if enabled_only:
            models = [m for m in models if m.enabled]
        return models

    async def health_check(self, model_id: str) -> dict[str, Any]:
        """Check health of a specific model."""
        if model_id not in self._models:
            return {"model_id": model_id, "status": "unknown"}

        descriptor = self._models[model_id]
        return {
            "model_id": model_id,
            "name": descriptor.name,
            "loaded": descriptor.loaded,
            "enabled": descriptor.enabled,
            "total_inferences": descriptor.total_inferences,
            "avg_latency_ms": round(descriptor.avg_latency_ms, 1),
        }
