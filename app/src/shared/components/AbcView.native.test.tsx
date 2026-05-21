/**
 * Component tests for {@link AbcView} on the native code path.
 *
 * Lives in its own file because forcing `Platform.OS = 'ios'` via
 * `vi.mock('react-native', …)` would otherwise bleed into the web tests
 * that share the same file. The WebView itself is mocked to a Test
 * component that captures its props — we don't try to render the real
 * `react-native-webview` (its Flow source can't be parsed by vite-node).
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { webviewSpy } = vi.hoisted(() => ({ webviewSpy: vi.fn() }));

vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    Platform: { ...actual.Platform, OS: 'ios' },
  };
});

vi.mock('react-native-webview', () => {
  return {
    WebView: (props: Record<string, unknown>) => {
      webviewSpy(props);
      // Render a real DOM element so the test can query it. We tag it
      // with the data attributes Testing Library can find. RN-Web maps
      // <View> → <div>; we mirror that here.
      const React = require('react');
      return React.createElement('div', {
        'data-testid': 'mock-webview',
        // Stash the dynamic height on a data attribute so the test can read it.
        'data-height': (props.style as { height?: number } | undefined)?.height ?? '',
      });
    },
  };
});

// Import AFTER vi.mock so the mocks take effect.
import { AbcView } from './AbcView';
import { useSettings } from '../store/settings';

const ABC = 'X:1\nT:Test\nM:4/4\nK:C\nC D E F |';

function resetSettings() {
  useSettings.setState({
    notation: 'cs',
    transpose: 0,
    capo: 0,
    fontSize: 16,
    lineSpacing: 1.4,
    darkMode: 'system',
    viewMode: 'staves',
    autoScrollSpeed: 30,
  });
}

describe('AbcView (native path)', () => {
  beforeEach(() => {
    webviewSpy.mockClear();
    resetSettings();
  });

  afterEach(() => {
    resetSettings();
  });

  test('renders a WebView (not a bare View) when Platform.OS === ios', () => {
    const { getByTestId } = render(<AbcView abc={ABC} />);
    expect(getByTestId('mock-webview')).toBeInTheDocument();
    expect(webviewSpy).toHaveBeenCalledTimes(1);
  });

  test('passes the buildHtml result as source.html', () => {
    render(<AbcView abc={ABC} fontSize={32} transpose={3} />);
    const props = webviewSpy.mock.calls[0]?.[0] as {
      source?: { html?: string };
    };
    const html = props.source?.html ?? '';
    // The ABC literal is JSON-encoded so quotes and newlines survive.
    expect(html).toContain(JSON.stringify(ABC));
    // fontSize=32 → scale = 1.25 × (32/16) = 2.5
    expect(html).toMatch(/scale:\s*2\.5/);
    expect(html).toMatch(/visualTranspose:\s*3/);
  });

  test('starts with a 120-px initial height', () => {
    const { getByTestId } = render(<AbcView abc={ABC} />);
    expect(getByTestId('mock-webview').getAttribute('data-height')).toBe('120');
  });

  test('grows to match height reported via postMessage', () => {
    const { getByTestId, rerender } = render(<AbcView abc={ABC} />);
    const initialProps = webviewSpy.mock.calls[0]?.[0] as {
      onMessage: (e: { nativeEvent: { data: string } }) => void;
    };

    act(() => {
      initialProps.onMessage({
        nativeEvent: { data: JSON.stringify({ kind: 'size', height: 248 }) },
      });
    });
    // Forcing a re-render lets us pick up the state change. (RN-Web +
    // mocked WebView don't auto-trigger Testing Library's effect loop.)
    rerender(<AbcView abc={ABC} />);

    expect(getByTestId('mock-webview').getAttribute('data-height')).toBe('248');
  });

  test('ignores postMessage payloads that are not {kind:size,height:N}', () => {
    const { getByTestId, rerender } = render(<AbcView abc={ABC} />);
    const onMessage = (
      webviewSpy.mock.calls[0]?.[0] as {
        onMessage: (e: { nativeEvent: { data: string } }) => void;
      }
    ).onMessage;

    act(() => onMessage({ nativeEvent: { data: 'not-json' } }));
    act(() => onMessage({ nativeEvent: { data: JSON.stringify({ kind: 'other' }) } }));
    act(() => onMessage({ nativeEvent: { data: JSON.stringify({ kind: 'size', height: 0 }) } }));
    rerender(<AbcView abc={ABC} />);

    // Height stays at the 120 initial because none of the messages were valid.
    expect(getByTestId('mock-webview').getAttribute('data-height')).toBe('120');
  });

  test('embeds the dark filter in the WebView HTML when darkMode is dark', () => {
    act(() => {
      useSettings.setState({ darkMode: 'dark' });
    });
    render(<AbcView abc={ABC} />);
    const html =
      (webviewSpy.mock.calls[0]?.[0] as { source?: { html?: string } })?.source?.html ?? '';
    expect(html).toMatch(/filter:\s*invert\(1\)\s*hue-rotate\(180deg\)/);
  });
});
