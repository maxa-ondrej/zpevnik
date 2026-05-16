"""Stage 5 — OCR of chord and lyric rows.

For each song-line found by stage 4, the chord and lyric rows have to be
turned back into text. We run Tesseract twice per line, with different
configurations:

* **Chord row** — high-bold short tokens drawn from a tiny alphabet. We
  force PSM 7 ("single line of text") and a strict character whitelist
  ``A-Hbmaj0-9#/+sus()…`` so Tesseract can't hallucinate prose. Language is
  forced to ``eng`` since the chord alphabet is identical regardless of the
  song language.

* **Lyric row** — a single line of Czech text. PSM 7 again, language is the
  profile's ``ocr.tesseractLang`` (``ces`` by default).

Both functions return ``list[OcrToken]`` with word-level bounding boxes —
x-coordinates are what stage 6 (alignment) joins chord-tokens to syllable
boxes on.

.. caution::
   Tesseract glues adjacent short tokens together when the inter-word gap
   falls below roughly 1× the character height (e.g. ``C G`` at 24 pt
   becomes ``CG``). Real chord rows have wide spacing (one chord per
   syllable position), so this is normally fine. If a particular songbook
   places chords tightly together, stage 4 should pre-split the chord-row
   crop into per-token sub-images using vertical projection before calling
   :func:`ocr_chord_row` — that work is deferred until we see a PDF that
   needs it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

ImageU8 = npt.NDArray[np.uint8]

# A conservative whitelist that covers the chord vocabulary in this songbook:
#   roots A–H (+ flat/sharp), qualities (m, maj, dim, aug, sus, add), digits
#   for extensions (6, 7, 9, 11, 13), slash bass (G/H), parentheses for
#   passing chords like "C(#5)". The trailing `:-` are common Tesseract
#   false-positives we keep so they're filtered downstream instead of being
#   silently dropped.
CHORD_WHITELIST = "ABCDEFGHabdgijmnopstu0123456789#♭♯b/+()."


@dataclass(frozen=True)
class OcrToken:
    text: str
    x_left: int
    x_right: int
    y_top: int
    y_bottom: int
    confidence: float  # 0..100; -1 if Tesseract didn't report one


def _image_to_tokens(
    image: ImageU8,
    *,
    lang: str,
    config: str,
) -> list[OcrToken]:
    import pytesseract

    data = pytesseract.image_to_data(
        image,
        lang=lang,
        config=config,
        output_type=pytesseract.Output.DICT,
    )
    tokens: list[OcrToken] = []
    n = len(data["text"])
    for i in range(n):
        word = (data["text"][i] or "").strip()
        if not word:
            continue
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        left = int(data["left"][i])
        top = int(data["top"][i])
        width = int(data["width"][i])
        height = int(data["height"][i])
        tokens.append(
            OcrToken(
                text=word,
                x_left=left,
                x_right=left + width,
                y_top=top,
                y_bottom=top + height,
                confidence=conf,
            )
        )
    return tokens


def ocr_chord_row(image: ImageU8) -> list[OcrToken]:
    """OCR a cropped chord-row image. PSM 7, English, chord whitelist."""
    config = (
        "--psm 7 "
        "-c preserve_interword_spaces=1 "
        f"-c tessedit_char_whitelist={CHORD_WHITELIST}"
    )
    return _image_to_tokens(image, lang="eng", config=config)


def ocr_lyric_row(image: ImageU8, *, lang: str = "ces") -> list[OcrToken]:
    """OCR a cropped lyric-row image. PSM 7, language from the profile."""
    config = "--psm 7 -c preserve_interword_spaces=1"
    return _image_to_tokens(image, lang=lang, config=config)
