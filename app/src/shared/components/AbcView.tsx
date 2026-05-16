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
}

export function AbcView({ abc }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;

    abcjs.renderAbc(el, abc, {
      responsive: 'resize',
      staffwidth: 740,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 4,
    });
  }, [abc]);

  return <View ref={ref} style={{ marginBottom: 16 }} />;
}
