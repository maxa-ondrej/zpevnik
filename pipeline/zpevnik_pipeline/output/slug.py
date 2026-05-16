"""Title → ASCII slug helper.

Slugs are stored in ``meta.json`` and used as part of the per-song
directory name. They must match the JSON Schema pattern
``^[a-z0-9]+(?:-[a-z0-9]+)*$``, which means: lowercase ASCII, hyphens as
the only separator, no leading/trailing hyphen, no double hyphens.

Czech diacritics are folded to ASCII via NFKD decomposition, so "Já mám
jen jednu věc" → "ja-mam-jen-jednu-vec".
"""

from __future__ import annotations

import re
import unicodedata


def slugify(text: str, *, fallback: str = "song") -> str:
    """Convert ``text`` into a slug matching the SongMeta schema pattern."""
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    lowered = ascii_only.lower()
    # Anything that isn't [a-z0-9] becomes a hyphen, then collapse repeats.
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or fallback
