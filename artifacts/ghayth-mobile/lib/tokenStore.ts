/**
 * Secure token storage. Holds the Bearer access token and the rotating refresh
 * token issued by `/api/auth/mobile/login`.
 *
 * Storage backend is platform-split:
 *   - Native (iOS/Android): `expo-secure-store` (Keychain / Keystore).
 *   - Web: `localStorage`, with an in-memory fallback. `expo-secure-store`
 *     ships an EMPTY web module (`export default {}`), so its `*Async` methods
 *     are `undefined` on web — calling them throws `TypeError`. Because the
 *     mobile app is also served as an Expo web export, persisting tokens via
 *     SecureStore on web silently broke login (a successful 200 was followed by
 *     a thrown setter). Routing web through `localStorage` fixed that.
 *
 *     But `localStorage` itself is NOT always available on web: a sandboxed /
 *     cross-origin iframe (e.g. the Replit canvas preview), Safari private
 *     mode, or partitioned third-party storage can make `localStorage` throw
 *     on access or silently drop writes. When that happens the tokens never
 *     persist, the immediate `/auth/me` read finds no token, and login fails
 *     silently — the same class of bug as the SecureStore one. To keep the
 *     session working everywhere, web reads/writes fall back to an in-memory
 *     map whenever `localStorage` is unavailable or throws. In-memory tokens
 *     last for the page session (good enough to use the app inside an embedded
 *     preview); a normal browser tab still gets durable `localStorage`.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "gh_access_token";
const REFRESH_KEY = "gh_refresh_token";

const isWeb = Platform.OS === "web";

// Per-page-session fallback used on web when `localStorage` is unavailable
// (sandboxed iframe / private mode / partitioned storage). Keeps the Bearer
// session alive even when nothing durable can be written.
const memoryStore = new Map<string, string>();

function webStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage ?? null;
    if (!ls) return null;
    // Probe: in some sandboxed/partitioned contexts `localStorage` exists but
    // throws (or is a no-op) on the first write. Verify a real round-trip.
    const probe = "__gh_ls_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    const ls = webStorage();
    if (ls) {
      try {
        ls.setItem(key, value);
        return;
      } catch {
        /* fall through to in-memory */
      }
    }
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    const ls = webStorage();
    if (ls) {
      try {
        const v = ls.getItem(key);
        if (v !== null) return v;
      } catch {
        /* fall through to in-memory */
      }
    }
    return memoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    const ls = webStorage();
    if (ls) {
      try {
        ls.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setItem(ACCESS_KEY, accessToken);
  await setItem(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  try {
    await deleteItem(ACCESS_KEY);
    await deleteItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}
