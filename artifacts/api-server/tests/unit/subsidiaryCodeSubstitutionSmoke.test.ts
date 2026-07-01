import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Control-account / subsidiary-ledger substitution — the deepest
 * pattern in financial systems (identical shape to Oracle/SAP/QB).
 *
 * At JE post time, when a line says e.g. `accountCode='1121'` (سلفة
 * الموظفين, control account) AND the line carries `employeeId=42`,
 * the line's accountCode is swapped to '1121-0042' — the employee's
 * subsidiary code. The control-account currentBalance still rolls up
 * because the parent/child link in chart_of_accounts is preserved.
 *
 * ON BY DEFAULT (البند ٤ — إذن إبراهيم «نعم حساب خاص»): every track posts to the
 * entity's own subsidiary automatically; a company opts OUT explicitly via
 * system_settings.gl_subsidiary_substitution='false'. Parent rollups are
 * unaffected (the CoA parent/child link is preserved). UI surfaces the toggle.
 */

const ENRICHER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/journalLineDimensionalEnricher.ts"),
  "utf8",
);
const BH = readFileSync(
  join(import.meta.dirname!, "../../src/lib/businessHelpers.ts"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dimensional-routing.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Substitution helper
// ─────────────────────────────────────────────────────────────────────────────
describe("substituteSubsidiaryAccountCodes — control-account swap", () => {
  it("exports the substitution function + the cache reset hook", () => {
    expect(ENRICHER).toMatch(/export async function substituteSubsidiaryAccountCodes/);
    expect(ENRICHER).toMatch(/export function _resetSubsidiarySubstitutionCache/);
  });

  it("entity FK → entityType map covers the 6 routable subsidiary entities", () => {
    const block = ENRICHER.match(/const SUBSTITUTION_ENTITY_ORDER[\s\S]{0,500}\];/);
    expect(block).toBeTruthy();
    for (const t of [
      `"employeeId", "employee"`,
      `"clientId",   "client"`,
      `"vendorId",   "vendor"`,
      `"driverId",   "driver"`,
      `"vehicleId",  "vehicle"`,
      `"propertyId", "property"`,
    ]) {
      expect(block![0]).toContain(t);
    }
  });

  it("SQL lookup joins subsidiary_accounts → chart_of_accounts on parentCode match", () => {
    // The discriminator — only swap when the subsidiary CoA's
    // parentCode matches the line's CURRENT accountCode. Without
    // this, a line posting to 4200 (revenue) wouldn't accidentally
    // get a customer's 1111 receivable subsidiary.
    expect(ENRICHER).toMatch(/JOIN chart_of_accounts child[\s\S]{0,400}child\."parentCode" = \$4/);
  });

  it("subsidiary lookup gates on isActive=true + deletedAt IS NULL (defence in depth)", () => {
    expect(ENRICHER).toMatch(/sa\."isActive" = true/);
    expect(ENRICHER).toMatch(/sa\."deletedAt" IS NULL/);
    expect(ENRICHER).toMatch(/child\."deletedAt" IS NULL/);
  });

  it("first hit wins — multi-entity lines (employeeId + clientId) take the first match", () => {
    // Walk loop ends with `return` on success. Pinning the early-
    // return so a refactor that introduces a "best match" rule trips
    // this test rather than silently changing semantics.
    expect(ENRICHER).toMatch(/if \(subCode\) \{\s*line\.accountCode = subCode;\s*return; \/\/ First hit wins/);
  });

  it("PER-JE CACHE — `${entityType}:${id}:${accountCode}` keyed (3-tuple)", () => {
    // A JE with 50 lines all on 1121 with the same employeeId hits
    // the cache 49 times — only ONE DB lookup. The cache key has 3
    // components because the same (entity, id) can have different
    // subsidiaries under different parents.
    expect(ENRICHER).toMatch(/const key = `\$\{entityType\}:\$\{id\}:\$\{line\.accountCode\}`/);
  });

  it("substitution is short-circuited when the line has no accountCode", () => {
    expect(ENRICHER).toMatch(/if \(!line\.accountCode\) return;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Feature flag — ON by default (البند ٤), opt-out only
// ─────────────────────────────────────────────────────────────────────────────
describe("isSubsidiarySubstitutionEnabled — feature flag, ON by default", () => {
  it("reads from system_settings key 'gl_subsidiary_substitution'", () => {
    expect(ENRICHER).toMatch(/key = 'gl_subsidiary_substitution'/);
  });

  it("respects company override; falls back to system-wide (NULL companyId) row", () => {
    expect(ENRICHER).toMatch(/AND \("companyId" = \$1 OR "companyId" IS NULL\)/);
    expect(ENRICHER).toMatch(/ORDER BY \("companyId" IS NULL\) ASC/);
  });

  it("enabled by default; disabled ONLY by an explicit opt-out ('false'/'0'/false)", () => {
    expect(ENRICHER).toMatch(/raw === "false" \|\| raw === "0" \|\| \(raw as unknown\) === false/);
    expect(ENRICHER).toMatch(/return !disabled;/);
  });

  it("returns TRUE (default-on) on read errors — substitution NEVER fails the JE post", () => {
    expect(ENRICHER).toMatch(/} catch \{[\s\S]*?return true;\s*\}/);
  });

  it("cached PER-PROCESS — flag is ops-flipped-once, single SELECT is enough", () => {
    expect(ENRICHER).toMatch(/const _substitutionFlagCache = new Map<number, boolean>\(\)/);
  });

  it("bulk substituteSubsidiaryAccountCodes EXITS EARLY when flag is off (zero-cost when disabled)", () => {
    expect(ENRICHER).toMatch(/if \(!\(await isSubsidiarySubstitutionEnabled\(client, companyId\)\)\) return;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. createJournalEntry — wires the substitution as the LAST enrichment step
// ─────────────────────────────────────────────────────────────────────────────
describe("createJournalEntry — wires substitution after CC enrichment", () => {
  it("imports substituteSubsidiaryAccountCodes from the enricher module", () => {
    expect(BH).toMatch(/substituteSubsidiaryAccountCodes,/);
  });

  it("invokes substitution AFTER the per-line CC enrichment (CC reads from line.accountCode, then subs)", () => {
    const enrichIdx = BH.lastIndexOf("await enrichJournalLines(client, params.lines");
    const subIdx = BH.lastIndexOf("await substituteSubsidiaryAccountCodes(client, params.lines");
    const loopIdx = BH.lastIndexOf("for (const line of params.lines)");
    expect(enrichIdx).toBeGreaterThan(0);
    expect(subIdx).toBeGreaterThan(enrichIdx);
    expect(loopIdx).toBeGreaterThan(subIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Feature-flag endpoints
// ─────────────────────────────────────────────────────────────────────────────
const STATE_GET = (() => {
  const m = FCC.match(/router\.get\("\/subsidiary-substitution\/state"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("state GET not found");
  return m[0];
})();
const STATE_PATCH = (() => {
  const m = FCC.match(/router\.patch\("\/subsidiary-substitution\/state"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("state PATCH not found");
  return m[0];
})();

describe("GET /finance/subsidiary-substitution/state", () => {
  it("registers under feature: finance.cost_centers, action: list (read-only)", () => {
    expect(STATE_GET).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"list"\s*\}\)/);
  });

  it("returns enabled flag + subsidiaryCount (UI uses this to decide whether to nudge)", () => {
    expect(STATE_GET).toMatch(/res\.json\(\{\s*enabled,\s*subsidiaryCount:/);
  });

  it("subsidiary count filters on isActive=true + deletedAt IS NULL (live mappings only)", () => {
    expect(STATE_GET).toMatch(/"isActive" = true/);
    expect(STATE_GET).toMatch(/"deletedAt" IS NULL/);
  });
});

describe("PATCH /finance/subsidiary-substitution/state", () => {
  it("requires update permission (write)", () => {
    expect(STATE_PATCH).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"update"\s*\}\)/);
  });

  it("upserts via ON CONFLICT (companyId, branchId, key) — idempotent toggle", () => {
    expect(STATE_PATCH).toMatch(/ON CONFLICT \("companyId", "branchId", key\)\s+DO UPDATE SET value = EXCLUDED\.value/);
  });

  it("RESETS the in-process flag cache after toggling — next JE picks up the new value", () => {
    expect(STATE_PATCH).toMatch(/_resetSubsidiarySubstitutionCache\(\)/);
  });

  it("audit-logs the toggle (action=gl.subsidiary_substitution.set)", () => {
    expect(STATE_PATCH).toMatch(/action: "gl\.subsidiary_substitution\.set"/);
  });

  it("zod schema accepts boolean enabled only", () => {
    expect(FCC).toMatch(/setSubstitutionSchema = z\.object\(\{ enabled: z\.boolean\(\) \}\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UI toggle on /finance/dimensional-routing
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/dimensional-routing — substitution toggle card", () => {
  it("queries the state endpoint", () => {
    expect(PAGE).toContain('"/finance/subsidiary-substitution/state"');
  });

  it("toggle mutation hits PATCH and invalidates the state cache key", () => {
    expect(PAGE).toMatch(/"PATCH"/);
    expect(PAGE).toContain('"dim-routing-substitution-state"');
  });

  it("toggle card explains the WHY in operator language (Arabic, with a concrete example)", () => {
    expect(PAGE).toContain("1121-0042");
    expect(PAGE).toContain("شجرة الحسابات");
  });

  it("Sparkles icon on disabled state + CheckCircle2 on enabled — visible signal", () => {
    expect(PAGE).toContain("CheckCircle2");
    expect(PAGE).toMatch(/substitution\.enabled \? \(/);
  });

  it("subsidiaryCount surfaced — operator sees 'how many mappings exist' before flipping", () => {
    expect(PAGE).toContain("substitution.subsidiaryCount");
  });

  it("stable testid on the toggle card + button", () => {
    expect(PAGE).toContain('data-testid="dim-routing-substitution"');
    expect(PAGE).toContain('data-testid="dim-routing-substitution-toggle"');
  });
});
