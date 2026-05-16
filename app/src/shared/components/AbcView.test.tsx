/**
 * Component tests for {@link AbcView} — web path only.
 *
 * On `Platform.OS === 'web'` (the runtime path under jsdom +
 * `react-native-web`), AbcView mounts a `<View>` and inside a `useEffect`
 * calls `abcjs.renderAbc(el, abc, options)`. We mock the abcjs module so
 * the test asserts on the call args rather than depending on actual SVG
 * rendering.
 *
 * The native `<WebView>` branch is exercised indirectly by the same source
 * code path (the inline HTML builder is pure), but its rendering depends
 * on `react-native-webview` which is non-trivial to mount under jsdom; it
 * is left uncovered here and verified manually on iOS/Android.
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AbcView } from './AbcView';

// AbcView does `import abcjs from 'abcjs'`, so the module's `default` export
// must be a mock object exposing `renderAbc` — we capture it for assertions.
// `vi.hoisted` lets us share the spy with the (hoisted) `vi.mock` factory.
const { renderAbcMock } = vi.hoisted(() => ({ renderAbcMock: vi.fn() }));

vi.mock('abcjs', () => ({
  default: { renderAbc: renderAbcMock },
  renderAbc: renderAbcMock,
}));

// `react-native-webview` ships Flow-typed source that vite-node can't parse;
// since the web path of AbcView doesn't render the WebView, we stub it.
vi.mock('react-native-webview', () => ({
  WebView: () => null,
}));

const SAMPLE_ABC = 'X:1\nT:Test\nM:4/4\nK:C\nC D E F | G A B c |';

describe('AbcView (web path)', () => {
  beforeEach(() => {
    renderAbcMock.mockClear();
  });

  test('calls abcjs.renderAbc with the supplied abc string', () => {
    render(<AbcView abc={SAMPLE_ABC} />);
    expect(renderAbcMock).toHaveBeenCalledTimes(1);
    const [, abcArg] = renderAbcMock.mock.calls[0] ?? [];
    expect(abcArg).toBe(SAMPLE_ABC);
  });

  test('passes computed scale and visualTranspose to renderAbc', () => {
    // BASE_FONT_SIZE = 16, BASE_SCALE = 1.25 → at fontSize=32 the scale
    // should double to 2.5. visualTranspose mirrors the `transpose` prop.
    render(<AbcView abc={SAMPLE_ABC} fontSize={32} transpose={3} />);
    const [, , options] = renderAbcMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      scale: 2.5,
      visualTranspose: 3,
      paddingbottom: 12,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      staffwidth: 740,
    });
  });

  test('uses sensible defaults when transpose/fontSize are omitted', () => {
    render(<AbcView abc={SAMPLE_ABC} />);
    const [, , options] = renderAbcMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      // 1.25 × (16 / 16) = 1.25
      scale: 1.25,
      visualTranspose: 0,
    });
  });

  test('re-renders with new props re-invokes renderAbc', () => {
    const { rerender } = render(<AbcView abc={SAMPLE_ABC} transpose={0} />);
    expect(renderAbcMock).toHaveBeenCalledTimes(1);
    rerender(<AbcView abc={SAMPLE_ABC} transpose={5} />);
    // Second effect runs because `transpose` (a dep of the useEffect)
    // changed.
    expect(renderAbcMock).toHaveBeenCalledTimes(2);
    const [, , optsSecond] = renderAbcMock.mock.calls[1] ?? [];
    expect(optsSecond).toMatchObject({ visualTranspose: 5 });
  });

  test('renders a host element for abcjs to mount into', () => {
    const { container } = render(<AbcView abc={SAMPLE_ABC} />);
    // react-native-web renders `<View>` as a `<div>`. The component returns
    // a single root view on the web path.
    expect(container.firstElementChild).not.toBeNull();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div');
  });
});
