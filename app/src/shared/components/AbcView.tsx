/**
 * Renders ABC music notation as SVG via abcjs.
 *
 * On web we render directly to the DOM using abcjs (a DOM-only library).
 * On iOS / Android we wrap abcjs inside a `WebView` that loads the library
 * from a CDN and posts its rendered height back to RN so the staff is
 * visible without scrolling inside the WebView.
 *
 * When `isFollowing` is set on the web path, the component drives abcjs
 * `TimingCallbacks` at the song's tempo: each played event highlights the
 * current notehead (and its `w:` syllable) red on the SVG, and beat
 * progress is reported via `onBeat` so the parent can sync a lyric-line
 * highlight in `SongView`.
 */

import abcjs from 'abcjs';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '../store/theme';

interface Props {
  abc: string;
  /** Semitones to shift the rendered notation. Matches the user's transpose setting. */
  transpose?: number;
  /** Lyric font size in px. Drives abcjs's `scale` so the staff grows with the text. */
  fontSize?: number;
  /** When true (and we're on web with a parsed visualObj), play through
   *  the notation, highlighting each note as it sounds. */
  isFollowing?: boolean;
  /** BPM (quarters-per-minute). Default 100 if undefined. */
  tempo?: number;
  /** Fires on every beat tick with the current beat number and the total
   *  beats in the piece — used by the parent to sync lyric-line highlight. */
  onBeat?: (beatNumber: number, totalBeats: number) => void;
  /** Fires when playback reaches the end (eventCallback gets null). */
  onFollowEnd?: () => void;
  /** Fires when playback enters a new staff line, with the y-coordinate of
   *  the first highlighted element *relative to AbcView's container*.
   *  The parent uses it to scroll the outer ScrollView so the new staff
   *  line is in view. */
  onStaffLineChange?: (yInsideAbcView: number) => void;
}

const BASE_FONT_SIZE = 16;
const BASE_SCALE = 1.25;
const ABCJS_CDN = 'https://cdn.jsdelivr.net/npm/abcjs@6.6.3/dist/abcjs-basic-min.js';
const HIGHLIGHT_CLASS = 'abcjs-note-highlighted';
const HIGHLIGHT_STYLE_ID = 'abcjs-note-highlight-style';

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
 * In dark mode we apply a CSS `invert + hue-rotate` filter on the body so
 * the black-on-transparent SVG abcjs produces reads as white-on-dark. The
 * RN background under the WebView stays transparent (themed by the
 * surrounding View).
 *
 * Exported for testing — the WebView itself is hard to mount under jsdom,
 * but the HTML it loads is a pure function we can pin.
 */
export function buildHtml(
  abc: string,
  scale: number,
  visualTranspose: number,
  isDark = false,
): string {
  const abcLiteral = JSON.stringify(abc);
  const darkFilter = isDark ? 'filter: invert(1) hue-rotate(180deg);' : '';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; ${darkFilter} }
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

function ensureHighlightStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = HIGHLIGHT_STYLE_ID;
  // High specificity + !important because abcjs sets `fill`/`stroke` inline
  // on a lot of elements; we need to override those. Red survives the
  // dark-mode `filter: invert` better than the theme accent does.
  el.textContent = `
    .${HIGHLIGHT_CLASS},
    .${HIGHLIGHT_CLASS} path,
    .${HIGHLIGHT_CLASS} ellipse {
      fill: #c0392b !important;
      stroke: #c0392b !important;
    }
    .${HIGHLIGHT_CLASS} text { fill: #c0392b !important; }
  `;
  document.head.appendChild(el);
}

type AbcEventElement = Element | AbcEventElement[];

function flattenElements(arr: AbcEventElement | AbcEventElement[] | null | undefined): Element[] {
  if (!arr) return [];
  if (Array.isArray(arr)) return arr.flatMap(flattenElements);
  if (typeof Element !== 'undefined' && arr instanceof Element) return [arr];
  return [];
}

function clearHighlights(container: HTMLElement | null) {
  if (!container) return;
  container
    .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
    .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
}

/**
 * Walk up from a highlighted note/syllable element to its enclosing
 * staff-line wrapper. abcjs assigns `abcjs-staff-wrapper abcjs-l[N]` to
 * each line `<g>`. Using the wrapper's y gives a STABLE position for all
 * events on the same musical line — using the note's own y bounces because
 * chord annotations sit higher in the same event.
 */
function findStaffLineWrapper(el: Element | null): Element | null {
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    const cl = (cur as Element).classList;
    if (cl && cl.contains('abcjs-staff-wrapper')) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function AbcView({
  abc,
  transpose = 0,
  fontSize = BASE_FONT_SIZE,
  isFollowing = false,
  tempo,
  onBeat,
  onFollowEnd,
  onStaffLineChange,
}: Props) {
  const ref = useRef<View>(null);
  const [height, setHeight] = useState<number>(120);
  const scale = buildScale(fontSize);
  const isDark = useTheme().isDark;
  // visualObj is needed by TimingCallbacks. We capture it from the render
  // call and keep it in a ref so the timing effect can read the latest.
  // Use `unknown` since abcjs's types aren't installed.
  const visualObjRef = useRef<unknown>(null);
  const timingRef = useRef<{ stop?: () => void } | null>(null);
  // Keep the latest callbacks in refs so the timing effect doesn't need to
  // re-create the TimingCallbacks on every render that closes over them.
  const onBeatRef = useRef(onBeat);
  const onFollowEndRef = useRef(onFollowEnd);
  const onStaffLineChangeRef = useRef(onStaffLineChange);
  useEffect(() => {
    onBeatRef.current = onBeat;
    onFollowEndRef.current = onFollowEnd;
    onStaffLineChangeRef.current = onStaffLineChange;
  }, [onBeat, onFollowEnd, onStaffLineChange]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    ensureHighlightStyle();

    // NOTE: do NOT pass `responsive: 'resize'` here — it makes the SVG fit
    // the container width and effectively ignores `scale`, so A-/A+ stops
    // affecting the staff. Letting abcjs compute its own width × scale
    // gives us a properly resizable staff at the cost of horizontal
    // overflow on narrow screens (which we'll address with CSS later).
    const result = abcjs.renderAbc(el, abc, {
      staffwidth: 740,
      visualTranspose: transpose,
      scale,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 12,
      lineThickness: 0.2,
    });
    // abcjs.renderAbc returns an array of "visualObj" parses, one per
    // tune. We use the first (our melody files all carry one tune).
    visualObjRef.current = Array.isArray(result) ? result[0] : null;
  }, [abc, transpose, fontSize, scale]);

  // TimingCallbacks: drive playback on the web path when isFollowing is
  // true. Per-note highlight is applied to event.elements via a CSS class;
  // beat progress is reported upward for the parent's lyric-line sync.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const container = ref.current as unknown as HTMLElement | null;
    if (!isFollowing) {
      if (timingRef.current?.stop) {
        try {
          timingRef.current.stop();
        } catch {
          // ignore — TimingCallbacks throws on already-stopped occasionally
        }
      }
      timingRef.current = null;
      clearHighlights(container);
      return;
    }
    const visualObj = visualObjRef.current;
    if (!visualObj) return;
    const TimingCallbacksCtor =
      (abcjs as unknown as { TimingCallbacks?: new (vo: unknown, params: object) => { stop: () => void; start: () => void } })
        .TimingCallbacks;
    if (typeof TimingCallbacksCtor !== 'function') return;

    const tc = new TimingCallbacksCtor(visualObj, {
      qpm: tempo ?? 100,
      eventCallback: (event: { elements?: AbcEventElement[] } | null) => {
        clearHighlights(container);
        if (event === null) {
          // End of song.
          onFollowEndRef.current?.();
          return;
        }
        const highlighted = event.elements ? flattenElements(event.elements) : [];
        highlighted.forEach((el) => el.classList?.add(HIGHLIGHT_CLASS));

        // Report the current STAFF LINE's y inside AbcView's container.
        // Walking up to `abcjs-staff-wrapper` gives a stable y for all
        // events on the same line — otherwise chord annotations (which
        // sit higher than the notehead in event.elements) make the y
        // bounce within one line.
        if (highlighted.length > 0 && container) {
          try {
            const wrapper = findStaffLineWrapper(highlighted[0] ?? null);
            const refEl: Element | null = wrapper ?? highlighted[0] ?? null;
            if (refEl && typeof (refEl as Element).getBoundingClientRect === 'function') {
              const elRect = (refEl as Element).getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              const yInsideAbcView = elRect.top - containerRect.top;
              onStaffLineChangeRef.current?.(yInsideAbcView);
            }
          } catch {
            // getBoundingClientRect can throw on detached nodes — ignore.
          }
        }
      },
      beatCallback: (beatNumber: number, totalBeats: number) => {
        onBeatRef.current?.(beatNumber, totalBeats);
      },
    });
    timingRef.current = tc;
    tc.start();
    return () => {
      try {
        tc.stop();
      } catch {
        // ignore
      }
      timingRef.current = null;
      clearHighlights(container);
    };
  }, [isFollowing, tempo, abc, transpose, fontSize, scale]);

  if (Platform.OS === 'web') {
    // CSS `filter: invert + hue-rotate` flips the black SVG abcjs draws
    // into white-on-dark without needing to know any abcjs internals.
    const darkStyle = isDark
      ? { filter: 'invert(1) hue-rotate(180deg)' as const }
      : null;
    return <View ref={ref} style={[{ marginBottom: 24 }, darkStyle]} />;
  }

  const html = buildHtml(abc, scale, transpose, isDark);

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
