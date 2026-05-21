"""MusicXML → ChordPro + melody.json converter.

For songs that exist as MusicXML (e.g. proscholy.cz exports from
Finale via Dolet), we skip the whole OCR cascade and produce the
same `{meta.json, song.cho, melody.json}` triple the app expects.

Public entry point: `convert_musicxml(xml_path) -> ConvertResult`.
"""

from .convert import ConvertResult, convert_musicxml

__all__ = ["ConvertResult", "convert_musicxml"]
