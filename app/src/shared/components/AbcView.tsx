/**
 * Renders ABC music notation as SVG via abcjs.
 *
 * Web-only for now — abcjs is a DOM library. On native platforms the
 * component renders nothing (gracefully degrades; the rest of the song
 * still shows). For native we'd need a WebView wrapper, deferred.
 */

import abcjs from 'abcjs';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

interface Props {
  abc: string;
  /** Semitones to shift the rendered notation. Matches the user's transpose setting. */
  transpose?: number;
  /** Lyric font size in px. Drives abcjs's `scale` so the staff grows with the text. */
  fontSize?: number;
}

const BASE_FONT_SIZE = 16;
const BASE_SCALE = 1.25;

export function AbcView({ abc, transpose = 0, fontSize = BASE_FONT_SIZE }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;

    const scale = BASE_SCALE * (fontSize / BASE_FONT_SIZE);

    // NOTE: do NOT pass `responsive: 'resize'` here — it makes the SVG fit
    // the container width and effectively ignores `scale`, so A-/A+ stops
    // affecting the staff. Letting abcjs compute its own width × scale
    // gives us a properly resizable staff at the cost of horizontal
    // overflow on narrow screens (which we'll address with CSS later).
    abcjs.renderAbc(el, abc, {
      staffwidth: 740,
      visualTranspose: transpose,
      scale,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 12,
      lineThickness: 0.2,
    });
  }, [abc, transpose, fontSize]);

  return <View ref={ref} style={{ marginBottom: 24 }} />;
}
