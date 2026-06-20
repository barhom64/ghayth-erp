/**
 * Native (Bearer) auth client. On web it is inert (isNativeAuth=false) so the
 * cookie flow is untouched; inside Capacitor it stores the tokens from
 * /auth/mobile/login and apiFetch sends them as Authorization: Bearer.
 * Tokens live in localStorage (persistent + synchronous in the WebView).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isNativeAuth, getNativeAccessToken, getNativeRefreshToken,
  setNativeTokens, clearNativeTokens, nativeRefresh,
} from "@/lib/native-auth";

beforeEach(() => { localStorage.clear(); delete (globalThis as any).Capacitor; });
afterEach(() => { vi.restoreAllMocks(); delete (globalThis as any).Capacitor; });

describe("native-auth — platform detection", () => {
  it("isNativeAuth() is false on the plain web", () => {
    expect(isNativeAuth()).toBe(false);
  });
  it("isNativeAuth() is true under Capacitor", () => {
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    expect(isNativeAuth()).toBe(true);
  });
});

describe("native-auth — token storage (localStorage)", () => {
  it("set/get/clear round-trip", () => {
    setNativeTokens("acc-1", "ref-1");
    expect(getNativeAccessToken()).toBe("acc-1");
    expect(getNativeRefreshToken()).toBe("ref-1");
    clearNativeTokens();
    expect(getNativeAccessToken()).toBeNull();
    expect(getNativeRefreshToken()).toBeNull();
  });
});

describe("native-auth — refresh rotation", () => {
  it("rotates the pair on success", async () => {
    setNativeTokens("old-acc", "old-ref");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, json: async () => ({ accessToken: "new-acc", refreshToken: "new-ref" }),
    })) as any);
    const ok = await nativeRefresh("https://api.example");
    expect(ok).toBe(true);
    expect(getNativeAccessToken()).toBe("new-acc");
    expect(getNativeRefreshToken()).toBe("new-ref");
  });
  it("clears the session and returns false on a failed refresh", async () => {
    setNativeTokens("old-acc", "old-ref");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })) as any);
    const ok = await nativeRefresh("https://api.example");
    expect(ok).toBe(false);
    expect(getNativeAccessToken()).toBeNull();
  });
  it("returns false with no stored refresh token (no network call)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy as any);
    expect(await nativeRefresh("https://api.example")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
