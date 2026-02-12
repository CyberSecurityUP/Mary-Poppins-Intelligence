"""
Mary Poppins — Image Preprocessing Adapters
Provides model-specific image preprocessing for the classification pipeline.

Different models require different normalization:
- ImageNet: standard torchvision normalization
- Caffe: BGR channel order with mean pixel subtraction (Yahoo Open NSFW)
- Raw 0-1: simple scaling to [0,1] range (NudeNet)
- CLIP: CLIP-specific normalization values

SAFETY: All processing happens in memory on numpy arrays.
No temporary files are created.
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image


class PreprocessingAdapter:
    """Adapts image bytes to the tensor format required by each model."""

    @staticmethod
    def preprocess(
        content: bytes,
        target_size: tuple[int, int],
        method: str,
    ) -> np.ndarray:
        """
        Preprocess image bytes for model inference.

        Args:
            content: Raw image bytes.
            target_size: (height, width) to resize to.
            method: Preprocessing method — "imagenet", "caffe", "raw_0_1", "clip".

        Returns:
            Preprocessed numpy array in NCHW format (batch=1).
        """
        img = Image.open(BytesIO(content)).convert("RGB")
        img = img.resize((target_size[1], target_size[0]), Image.LANCZOS)
        arr = np.array(img, dtype=np.float32)

        if method == "imagenet":
            return PreprocessingAdapter._imagenet(arr)
        elif method == "caffe":
            return PreprocessingAdapter._caffe(arr)
        elif method == "raw_0_1":
            return PreprocessingAdapter._raw_0_1(arr)
        elif method == "clip":
            return PreprocessingAdapter._clip(arr)
        else:
            raise ValueError(f"Unknown preprocessing method: {method}")

    @staticmethod
    def _imagenet(arr: np.ndarray) -> np.ndarray:
        """Standard ImageNet normalization (torchvision convention).

        RGB [0,255] -> [0,1] -> subtract mean -> divide std -> NCHW
        """
        arr = arr / 255.0
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        arr = (arr - mean) / std
        arr = np.transpose(arr, (2, 0, 1))  # HWC -> CHW
        return np.expand_dims(arr, axis=0)    # -> NCHW

    @staticmethod
    def _caffe(arr: np.ndarray) -> np.ndarray:
        """Caffe-style preprocessing (Yahoo Open NSFW).

        RGB -> BGR, subtract mean pixel [103.939, 116.779, 123.68] -> NCHW
        """
        arr = arr[:, :, ::-1]  # RGB -> BGR
        mean = np.array([103.939, 116.779, 123.68])
        arr = arr - mean
        arr = np.transpose(arr, (2, 0, 1))
        return np.expand_dims(arr, axis=0)

    @staticmethod
    def _raw_0_1(arr: np.ndarray) -> np.ndarray:
        """Simple [0,1] scaling, no normalization (NudeNet).

        RGB [0,255] -> [0,1] -> NCHW
        """
        arr = arr / 255.0
        arr = np.transpose(arr, (2, 0, 1))
        return np.expand_dims(arr, axis=0)

    @staticmethod
    def _clip(arr: np.ndarray) -> np.ndarray:
        """CLIP-specific normalization.

        RGB [0,255] -> [0,1] -> CLIP mean/std -> NCHW
        """
        arr = arr / 255.0
        mean = np.array([0.48145466, 0.4578275, 0.40821073])
        std = np.array([0.26862954, 0.26130258, 0.27577711])
        arr = (arr - mean) / std
        arr = np.transpose(arr, (2, 0, 1))
        return np.expand_dims(arr, axis=0)
