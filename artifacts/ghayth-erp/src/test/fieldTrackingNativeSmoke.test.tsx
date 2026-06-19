/**
 * Field-tracking native bridge (Capacitor background geolocation).
 *
 * The bridge must be INERT on the web — no static Capacitor import, and
 * isNativeFieldTracking() must be false in a plain browser/jsdom so the
 * page keeps using the watchPosition + Wake Lock fallback. We also assert
 * the source never statically imports the plugin (it's a runtime dynamic
 * import so the web bundle/typecheck stays clean and dependency-free).
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNativeFieldTracking } from "@/lib/field-tracking-native";

const SRC = readFileSync(
  join(import.meta.dirname!, "../lib/field-tracking-native.ts"),
  "utf8",
);

afterEach(() => { delete (globalThis as any).Capacitor; });

describe("field-tracking native bridge — inert on web", () => {
  it("isNativeFieldTracking() is false in a plain browser (no Capacitor)", () => {
    expect(isNativeFieldTracking()).toBe(false);
  });

  it("is true only when window.Capacitor.isNativePlatform() reports native", () => {
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    expect(isNativeFieldTracking()).toBe(true);
    (globalThis as any).Capacitor = { isNativePlatform: () => false };
    expect(isNativeFieldTracking()).toBe(false);
  });

  it("never statically imports the Capacitor plugin (dynamic import only)", () => {
    // no top-level `import ... from "@capacitor..."` — keeps the web build clean
    expect(SRC).not.toMatch(/^\s*import\s+[^\n]*from\s+["']@capacitor/m);
    // it DOES load the plugin via a guarded dynamic import
    expect(SRC).toMatch(/await import\(\/\* @vite-ignore \*\/ spec\)/);
  });

  it("posts native pings with source:'native' and a Bearer token", () => {
    expect(SRC).toMatch(/source: "native"/);
    expect(SRC).toMatch(/Authorization: `Bearer \$\{opts\.token\}`/);
  });
});
