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
}

export function AbcView({ abc, transpose = 0 }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;

    abcjs.renderAbc(el, abc, {
      responsive: 'resize',
      staffwidth: 900,
      visualTranspose: transpose,
      // Roomy vertical layout — the page will eventually autoscroll, so we
      // prefer breathing room over a compact summary.
      scale: 1.25,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 12,
      lineThickness: 0.2,
    });
  }, [abc, transpose]);

  return <View ref={ref} style={{ marginBottom: 24 }} />;
}
