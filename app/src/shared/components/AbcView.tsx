/**
 * Renders ABC music notation as SVG via abcjs.
 *
 * On web we render directly to the DOM using abcjs (a DOM-only library).
 * On iOS / Android we wrap abcjs inside a `WebView` that loads the library
 * from a CDN and posts its rendered height back to RN so the staff is
 * visible without scrolling inside the WebView.
 */

import abcjs from 'abcjs';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

interface Props {
  abc: string;
  /** Semitones to shift the rendered notation. Matches the user's transpose setting. */
  transpose?: number;
  /** Lyric font size in px. Drives abcjs's `scale` so the staff grows with the text. */
  fontSize?: number;
}

const BASE_FONT_SIZE = 16;
const BASE_SCALE = 1.25;
const ABCJS_CDN = 'https://cdn.jsdelivr.net/npm/abcjs@6.6.3/dist/abcjs-basic-min.js';

export function buildScale(fontSize: number): number {
  return BASE_SCALE * (fontSize / BASE_FONT_SIZE);
}

/**
 * Inline HTML document for the WebView. abcjs is loaded from a CDN, mounted
 * at `<div id="paper">`, and once it has finished rendering we post the
 * document height back so RN can size the WebView container.
 *
 * NOTE: do NOT pass `responsive: 'resize'` here — it makes the SVG fit
 * the container width and effectively ignores `scale`.
 *
 * Exported for testing — the WebView itself is hard to mount under jsdom,
 * but the HTML it loads is a pure function we can pin.
 */
export function buildHtml(abc: string, scale: number, visualTranspose: number): string {
  const abcLiteral = JSON.stringify(abc);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #paper { padding: 0; }
</style>
</head>
<body>
<div id="paper"></div>
<script src="${ABCJS_CDN}"></script>
<script>
  (function () {
    function postSize() {
      try {
        var h = document.body.scrollHeight;
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'size', height: h }));
        }
      } catch (e) {}
    }
    function render() {
      if (typeof ABCJS === 'undefined') {
        setTimeout(render, 30);
        return;
      }
      ABCJS.renderAbc("paper", ${abcLiteral}, {
        scale: ${scale},
        visualTranspose: ${visualTranspose},
        paddingbottom: 12
      });
      // Allow layout to settle, then report height.
      requestAnimationFrame(function () {
        postSize();
        // A second pass catches late font/SVG layout shifts.
        setTimeout(postSize, 80);
      });
    }
    render();
  })();
</script>
</body>
</html>`;
}

export function AbcView({ abc, transpose = 0, fontSize = BASE_FONT_SIZE }: Props) {
  const ref = useRef<View>(null);
  const [height, setHeight] = useState<number>(120);
  const scale = buildScale(fontSize);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;

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
  }, [abc, transpose, fontSize, scale]);

  if (Platform.OS === 'web') {
    return <View ref={ref} style={{ marginBottom: 24 }} />;
  }

  const html = buildHtml(abc, scale, transpose);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { kind?: string; height?: number };
      if (data.kind === 'size' && typeof data.height === 'number' && data.height > 0) {
        setHeight((prev) => (Math.abs(prev - data.height!) > 1 ? data.height! : prev));
      }
    } catch {
      // Ignore non-JSON messages.
    }
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ height, backgroundColor: 'transparent' }}
        javaScriptEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
      />
    </View>
  );
}
