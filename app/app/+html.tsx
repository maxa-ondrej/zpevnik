// Web-only root HTML override. Runs at static-render time on Node and
// also wraps every page in the browser. The body content here ends up
// in the SSR snapshot.

import { ScrollViewStyleReset } from 'expo-router/html';

// Pre-hydration script: resolves the user's dark-mode preference from
// localStorage (set by zustand-persist) falling back to the system
// `prefers-color-scheme`, and paints <html>'s background + colorScheme
// before React boots. Without this:
//   - Browsers don't know the page supports dark mode, so native UI
//     (scrollbars, form controls) stays light.
//   - The SSR-baked light theme flashes briefly even for users whose
//     system is dark — React doesn't pick up the preference until
//     hydration completes.
//
// Keep this script tiny and dependency-free — it runs before any
// module loads. Same color literals as src/shared/store/theme.ts;
// they're duplicated on purpose since the theme module can't be
// imported at this layer.
const PRE_HYDRATE_SCRIPT = `
(function(){
  try {
    var setting = 'system';
    var raw = localStorage.getItem('zpevnik-settings');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && typeof parsed.state.darkMode === 'string') {
        setting = parsed.state.darkMode;
      }
    }
    var isDark =
      setting === 'dark' ||
      (setting === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.style.backgroundColor = isDark ? '#121212' : '#ffffff';
    root.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/* Tells the browser the page supports both light + dark, so
            native UI (scrollbars, form controls) gets dark-themed
            automatically when the user prefers dark. */}
        <meta name="color-scheme" content="light dark" />
        <ScrollViewStyleReset />
        {/* Pre-hydration paint. See PRE_HYDRATE_SCRIPT comment. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
