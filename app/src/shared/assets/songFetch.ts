/**
 * Network-first `fetch` for `/songs/...` assets, with a local-disk
 * fallback on native so the reader keeps working off-Wi-Fi.
 *
 * Resolution order for the BASE URL:
 *   1. `EXPO_PUBLIC_SONGS_BASE_URL` (production / staging override).
 *      Point this at the reviewer's `/songs/` mount or any HTTP host
 *      serving the same tree shape.
 *   2. `Constants.expoConfig.hostUri` (Expo dev — the Metro server's
 *      LAN host:port). Phone-on-same-Wi-Fi fetches from your laptop.
 *   3. Empty string (web only — relative `/songs/…` resolves against
 *      the page's origin, the static export the same Expo build
 *      served).
 *
 * Caching (NATIVE only):
 *   - On successful network fetch: write the body to
 *     `documentDirectory + songs-cache/<path>` so the next-best
 *     offline read can serve it.
 *   - On network failure (or non-2xx): try the cached copy. If we
 *     have one, return it with status 200 (well, a stand-in
 *     Response). If we don't, return the failure as-is so the
 *     caller's existing error path runs.
 *   - Web: no cache layer — the browser already does this.
 *
 * The helper returns the standard `Response` type so callers' use
 * of `.ok`, `.text()`, `.json()` works unchanged.
 */
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const CACHE_SUBDIR = 'songs-cache';

export function songsBase(): string {
  if (Platform.OS === 'web') return '';
  const env = process.env.EXPO_PUBLIC_SONGS_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { hostUri?: string } })
      .expoGoConfig?.hostUri ??
    '';
  if (!hostUri) return '';
  const hostPort = hostUri.split('/')[0];
  return `http://${hostPort}`;
}

export function songsUrl(path: string): string {
  return songsBase() + path;
}

function cachePathFor(path: string): string | null {
  if (Platform.OS === 'web') return null;
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  // Strip the leading `/songs/` and re-anchor under our cache dir,
  // so the cached layout mirrors the URL tree exactly.
  const stripped = path.replace(/^\/+/, '');
  return root + CACHE_SUBDIR + '/' + stripped;
}

async function writeCache(path: string, body: string): Promise<void> {
  const target = cachePathFor(path);
  if (!target) return;
  try {
    const dirEnd = target.lastIndexOf('/');
    if (dirEnd > 0) {
      await FileSystem.makeDirectoryAsync(target.substring(0, dirEnd), {
        intermediates: true,
      });
    }
    await FileSystem.writeAsStringAsync(target, body);
  } catch {
    // Cache writes are best-effort; we always return the live response.
  }
}

async function readCache(path: string): Promise<string | null> {
  const target = cachePathFor(path);
  if (!target) return null;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(target);
  } catch {
    return null;
  }
}

function syntheticResponse(body: string, status: number, statusText = ''): Response {
  // RN ships a Fetch polyfill that exposes `Response` globally.
  return new Response(body, {
    status,
    statusText,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

export async function songFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = songsUrl(path);
  // Web → just fetch; the browser caches as it sees fit.
  if (Platform.OS === 'web') return fetch(url, init);

  // Native — network first, refresh cache on success, fall back on miss.
  let networkResponse: Response | null = null;
  let networkError: unknown = null;
  try {
    networkResponse = await fetch(url, init);
  } catch (e) {
    networkError = e;
  }

  if (networkResponse && networkResponse.ok) {
    // Tee the body: we want to both write the cache AND hand the
    // caller a fresh Response with a readable body.
    const text = await networkResponse.text();
    // Don't await — let the cache write happen in the background.
    void writeCache(path, text);
    return syntheticResponse(text, networkResponse.status, networkResponse.statusText);
  }

  // Network said no (timeout, offline, 5xx) — try cache.
  const cached = await readCache(path);
  if (cached !== null) {
    return syntheticResponse(cached, 200, 'OK (cached)');
  }
  // Nothing to serve. Surface the original failure so the caller's
  // error path fires the same way it would have without us.
  if (networkResponse) return networkResponse;
  throw networkError ?? new Error('songFetch: network failed and no cache');
}
