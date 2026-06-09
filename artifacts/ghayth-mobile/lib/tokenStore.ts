/**
 * Secure token storage. Holds the Bearer access token and the rotating refresh
 * token issued by `/api/auth/mobile/login`.
 *
 * Storage backend is platform-split:
 *   - Native (iOS/Android): `expo-secure-store` (Keychain / Keystore).
 *   - Web: `localStorage`. `expo-secure-store` ships an EMPTY web module
 *     (`export default {}`), so its `*Async` methods are `undefined` on web —
 *     calling them throws `TypeError`. Because the mobile app is also served as
 *     an Expo web export, persisting tokens via SecureStore on web silently
 *     broke login (a successful 200 was followed by a thrown setter). Routing
 *     web through `localStorage` keeps the session working everywhere.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "gh_access_token";
const REFRESH_KEY = "gh_refresh_token";

const isWeb = Platform.OS === "web";

function webStorage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" ? (globalThis as { localStorage?: Storage }).localStorage ?? null : null;
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return webStorage()?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
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
