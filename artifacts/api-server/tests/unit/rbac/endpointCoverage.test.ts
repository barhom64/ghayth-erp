import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_CATALOG } from "../../../src/lib/rbac/featureCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesDir = join(__dirname, "../../../src/routes");

// Scrape every authorize({ feature: "X", action: "Y" }) call out of the
// route files and verify the feature key exists in the catalog. This
// catches drift between code and catalog at test-time rather than at
// runtime, where a misspelled feature key silently denies every caller.
function scrapeAuthorizeCalls(): Array<{ file: string; line: number; feature: string; action: string }> {
  const out: Array<{ file: string; line: number; feature: string; action: string }> = [];
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
  const re = /authorize\(\{\s*feature:\s*"([a-z0-9_.]+)"\s*,\s*action:\s*"([a-z_]+)"/g;
  for (const file of files) {
    const src = readFileSync(join(routesDir, file), "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let m: RegExpExecArray | null;
      const lineRe = new RegExp(re.source, "g");
      while ((m = lineRe.exec(lines[i])) !== null) {
        out.push({ file, line: i + 1, feature: m[1], action: m[2] });
      }
    }
  }
  return out;
}

describe("RBAC endpoint catalog coverage", () => {
  const catalogKeys = new Set(FEATURE_CATALOG.map((f) => f.key));
  const calls = scrapeAuthorizeCalls();

  it("scrapes at least 1000 authorize() calls across routes", () => {
    expect(calls.length).toBeGreaterThan(1000);
  });

  it("every feature key referenced in authorize() exists in the catalog", () => {
    const unknown = calls.filter((c) => !catalogKeys.has(c.feature));
    if (unknown.length > 0) {
      const samples = unknown.slice(0, 10).map((u) => `${u.file}:${u.line} feature="${u.feature}"`);
      throw new Error(
        `${unknown.length} authorize() calls reference unknown feature keys. Samples:\n  ${samples.join("\n  ")}`
      );
    }
    expect(unknown).toEqual([]);
  });

  it("every action referenced in authorize() is supported by its feature", () => {
    const featureByKey = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));
    const invalid: Array<{ file: string; line: number; feature: string; action: string }> = [];
    for (const c of calls) {
      const feat = featureByKey.get(c.feature);
      if (!feat) continue; // already flagged by the previous test
      if (!feat.availableActions.includes(c.action as any)) {
        invalid.push(c);
      }
    }
    if (invalid.length > 0) {
      const samples = invalid.slice(0, 10).map((u) => `${u.file}:${u.line} ${u.feature}:${u.action}`);
      throw new Error(
        `${invalid.length} authorize() calls use an action not declared in availableActions. Samples:\n  ${samples.join("\n  ")}`
      );
    }
    expect(invalid).toEqual([]);
  });
});
