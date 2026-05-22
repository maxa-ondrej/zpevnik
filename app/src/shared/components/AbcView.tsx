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
  /** Fires once per played event (one note onset). Lets a karaoke-style
   *  view advance a per-syllable cursor in lockstep with the music
   *  instead of approximating via fractional beat math. */
  onNoteEvent?: () => void;
  /** When true, skip the per-event DOM highlight + getBoundingClientRect
   *  work. Use this when AbcView is mounted purely as a timing source
   *  (e.g. inside the karaoke pitch-bar path, where the staff is
   *  hidden); the DOM mutations trigger style invalidation and the
   *  bounding-rect calls force layout flushes that visibly stutter the
   *  rAF loop on the main React tree. onNoteEvent / onFollowEnd /
   *  onBeat still fire normally. */
  silent?: boolean;
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
  tempo: number = 100,
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
  /* Play-mode note highlight (web path uses the same class). Red
     survives the dark-mode inverted-color theme. */
  .${HIGHLIGHT_CLASS},
  .${HIGHLIGHT_CLASS} path,
  .${HIGHLIGHT_CLASS} ellipse { fill: #c0392b !important; stroke: #c0392b !important; }
  .${HIGHLIGHT_CLASS} text { fill: #c0392b !important; }
</style>
</head>
<body>
<div id="paper"></div>
<script src="${ABCJS_CDN}"></script>
<script>
  (function () {
    function post(msg) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      } catch (e) {}
    }
    function postSize() {
      try { post({ kind: 'size', height: document.body.scrollHeight }); } catch (e) {}
    }
    function clearHighlights() {
      var nodes = document.querySelectorAll('.${HIGHLIGHT_CLASS}');
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('${HIGHLIGHT_CLASS}');
    }
    function findWrapper(el) {
      var cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.classList && cur.classList.contains('abcjs-staff-wrapper')) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    function flatten(arr) {
      if (!arr) return [];
      if (!Array.isArray(arr)) return [arr];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var sub = flatten(arr[i]);
        for (var j = 0; j < sub.length; j++) out.push(sub[j]);
      }
      return out;
    }
    window.__z = { visualObj: null, tc: null, tempo: ${tempo} };
    window.__zStart = function () {
      if (!window.__z.visualObj || window.__z.tc) return;
      if (typeof ABCJS.TimingCallbacks !== 'function') return;
      var tc = new ABCJS.TimingCallbacks(window.__z.visualObj, {
        qpm: window.__z.tempo,
        eventCallback: function (event) {
          clearHighlights();
          if (event === null) {
            post({ kind: 'followEnd' });
            return;
          }
          var els = flatten(event.elements);
          for (var i = 0; i < els.length; i++) {
            if (els[i] && els[i].classList) els[i].classList.add('${HIGHLIGHT_CLASS}');
          }
          if (els.length > 0) {
            try {
              var wrapper = findWrapper(els[0]);
              var ref = wrapper || els[0];
              if (ref && ref.getBoundingClientRect) {
                var r = ref.getBoundingClientRect();
                // y inside the WebView's document (= y inside AbcView,
                // since the WebView frame sits at 0 inside that View).
                post({ kind: 'staffLine', y: r.top + (window.scrollY || 0) });
              }
            } catch (e) {}
          }
          // Per-note tick for the karaoke view's per-syllable cursor.
          // Fired for every non-null event regardless of how many SVG
          // elements it carries — one event = one logical note onset.
          post({ kind: 'noteEvent' });
        },
        beatCallback: function (beat, total) {
          post({ kind: 'beat', beat: beat, total: total });
        }
      });
      try { tc.start(); window.__z.tc = tc; } catch (e) {}
    };
    window.__zStop = function () {
      if (window.__z.tc) {
        try { window.__z.tc.stop(); } catch (e) {}
        window.__z.tc = null;
      }
      clearHighlights();
    };
    function render() {
      if (typeof ABCJS === 'undefined') {
        setTimeout(render, 30);
        return;
      }
      // Fit the staff to the WebView width AND override the source's
      // engraver-set line breaks — the converter groups measures by
      // <print new-system> (designed for an A4 page), which produces
      // 6-8 measures per line. Squishes on phone.
      //
      // Measures-per-line is gated on EFFECTIVE width (clientWidth /
      // scale) so bumping font size pushes us to fewer measures per
      // line automatically; otherwise the larger notes overlap their
      // lyrics at the same wrap target.
      var clientWidth = document.body.clientWidth;
      var staffWidth = Math.max(240, clientWidth - 4);
      var effective = clientWidth / ${scale};
      var opts = {
        staffwidth: staffWidth,
        scale: ${scale},
        visualTranspose: ${visualTranspose},
        paddingleft: 0,
        paddingright: 0,
        paddingbottom: 12
      };
      var preferred;
      if      (effective < 280) preferred = 1;
      else if (effective < 420) preferred = 2;
      else if (effective < 600) preferred = 3;
      else if (effective < 820) preferred = 4;
      // wider → let abcjs use the source breaks (engraver's intent)
      if (preferred) {
        opts.wrap = { preferredMeasuresPerLine: preferred, lastLineLimit: 1 };
      }
      // add_classes is mandatory for the staff-line wrapper walk-up
      // findWrapper() relies on in __zStart's eventCallback.
      opts.add_classes = true;
      var result = ABCJS.renderAbc("paper", ${abcLiteral}, opts);
      window.__z.visualObj = Array.isArray(result) ? result[0] : result;
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
  onNoteEvent,
  silent = false,
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
  const onNoteEventRef = useRef(onNoteEvent);
  const silentRef = useRef(silent);
  useEffect(() => {
    onBeatRef.current = onBeat;
    onFollowEndRef.current = onFollowEnd;
    onStaffLineChangeRef.current = onStaffLineChange;
    onNoteEventRef.current = onNoteEvent;
    silentRef.current = silent;
  }, [onBeat, onFollowEnd, onStaffLineChange, onNoteEvent, silent]);

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
      // Tag every staff-line `<g>` with `abcjs-staff-wrapper abcjs-l[N]`.
      // findStaffLineWrapper() in the timing path relies on this so the
      // reported y is stable for all events on the same musical line
      // (otherwise the chord-annotation `<text>` and the notehead path
      // sit at different y's and the cursor bounces inside one line).
      add_classes: true,
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
        if (event === null) {
          // End of song. Always clear (cheap, runs once).
          clearHighlights(container);
          onFollowEndRef.current?.();
          return;
        }
        // Silent mode: skip ALL DOM work. The pitch-bar karaoke path
        // mounts AbcView at 0×0 purely as a timing source; the
        // clearHighlights + classList mutations + getBoundingClientRect
        // calls below force layout flushes on the main thread, visibly
        // stuttering the rAF loop driving the pitch-bar strip.
        if (silentRef.current) {
          onNoteEventRef.current?.();
          return;
        }
        clearHighlights(container);
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
        // Per-note tick for the karaoke per-syllable cursor.
        onNoteEventRef.current?.();
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

  const html = buildHtml(abc, scale, transpose, isDark, tempo ?? 100);
  const webViewRef = useRef<WebView>(null);

  // Drive Play inside the WebView: when isFollowing flips, push a
  // `__zStart()` / `__zStop()` invocation into the page via
  // injectJavaScript. The HTML pre-registers both as window methods
  // (see buildHtml above). On a fresh mount the first injection
  // may race the script init — that's why the injected snippet
  // wraps in `if (window.__zStart) ...`.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const wv = webViewRef.current;
    if (!wv) return;
    const code = isFollowing
      ? 'if (window.__zStart) { window.__zStart(); } true;'
      : 'if (window.__zStop) { window.__zStop(); } true;';
    wv.injectJavaScript(code);
  }, [isFollowing, tempo, abc]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        kind?: string;
        height?: number;
        beat?: number;
        total?: number;
        y?: number;
      };
      if (data.kind === 'size' && typeof data.height === 'number' && data.height > 0) {
        setHeight((prev) => (Math.abs(prev - data.height!) > 1 ? data.height! : prev));
        return;
      }
      if (data.kind === 'beat' && typeof data.beat === 'number' && typeof data.total === 'number') {
        onBeatRef.current?.(data.beat, data.total);
        return;
      }
      if (data.kind === 'staffLine' && typeof data.y === 'number') {
        onStaffLineChangeRef.current?.(data.y);
        return;
      }
      if (data.kind === 'followEnd') {
        onFollowEndRef.current?.();
        return;
      }
      if (data.kind === 'noteEvent') {
        onNoteEventRef.current?.();
        return;
      }
    } catch {
      // Ignore non-JSON messages.
    }
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <WebView
        // Force a fresh WebView when the theme (or other build-time
        // params baked into the HTML) flips, otherwise some platforms
        // hold onto the stale source.html and the dark-mode filter
        // never applies.
        key={`${isDark ? 'dark' : 'light'}-${tempo ?? 100}`}
        ref={webViewRef}
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
