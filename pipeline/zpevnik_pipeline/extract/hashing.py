"""Stable per-page hashing for incremental pipeline runs.

The hash is computed from the *raw* rasterized page bytes — not from
normalized output — so re-running with different normalization parameters
still gets cache hits when the source page is unchanged.
"""

from __future__ import annotations

import hashlib

import numpy.typing as npt


def hash_page(image_bytes: bytes | npt.NDArray) -> str:
    """SHA-256 of the raw bytes (or `.tobytes()` of a numpy array)."""
    payload = image_bytes if isinstance(image_bytes, bytes) else image_bytes.tobytes()
    return hashlib.sha256(payload).hexdigest()
