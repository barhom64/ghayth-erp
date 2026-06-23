import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
  ALL_POLICY_IDS,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * §8 Phase 2 of #1870 — Umrah Settings Policies Catalog.
 *
 * Pins:
 *   1. Catalog covers all 11 policy categories from the Charter.
 *   2. Every category has at least one field + Arabic label.
 *   3. GET /umrah/settings/policies serves the catalog + current
 *      values (one DB round-trip via ANY($1::text[])).
 *   4. PUT /umrah/settings/policies/:categoryId saves through the
 *      shared upsertSetting helper, with a whitelist guard on
 *      unknown keys + an audit row.
 *   5. The FE PoliciesTab is embedded in the settings page.
 */
// U-07 Phase 18 — settings/policies routes carved into umrah-settings.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-settings.ts"),
  "utf8",
);
const TAB = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/umrah/policies-tab.tsx"),
  "utf8",
);
const SETTINGS_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

const REQUIRED_CATEGORIES = [
  "season",
  "visa",
  "overstay_grace",
  "violations",
  "import",
  "auto_link",
  "pricing",
  "commission",
  "financial",
  "calendar",
  "notifications",
] as const;

describe("catalog — 11-category coverage", () => {
  it("covers every Charter category", () => {
    const present = new Set(ALL_POLICY_IDS);
    const missing = REQUIRED_CATEGORIES.filter((c) => !present.has(c));
    expect(missing, `missing categories: ${missing.join(", ")}`).toEqual([]);
  });

  it("no duplicates (catches copy-paste drift)", () => {
    expect(new Set(ALL_POLICY_IDS).size).toBe(ALL_POLICY_IDS.length);
  });

  it("every category has Arabic title + description + ≥1 field", () => {
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      expect(cat.title.length, `${cat.id} title`).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(cat.title), `${cat.id} Arabic title`).toBe(true);
      expect(cat.description.length, `${cat.id} description`).toBeGreaterThan(0);
      expect(cat.fields.length, `${cat.id} fields`).toBeGreaterThan(0);
    }
  });

  it("every field has a known type", () => {
    const validTypes = new Set(["number", "boolean", "text", "select"]);
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      for (const f of cat.fields) {
        expect(validTypes.has(f.type), `${cat.id}.${f.key} type=${f.type}`).toBe(true);
      }
    }
  });

  it("select fields carry their options", () => {
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      for (const f of cat.fields) {
        if (f.type === "select") {
          expect(f.options, `${cat.id}.${f.key} select needs options`).toBeTruthy();
          expect(f.options!.length).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe("API — GET /settings/policies", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/settings\/policies"/);
  });

  it("does ONE round-trip via ANY($1::text[])", () => {
    expect(ROUTE).toMatch(/WHERE key = ANY\(\$1::text\[\]\)/);
  });

  it("respects system → company precedence", () => {
    expect(ROUTE).toMatch(/scope = 'system' AND "scopeId" IS NULL/);
    expect(ROUTE).toMatch(/scope = 'company' AND "scopeId" = \$2/);
    expect(ROUTE).toMatch(/CASE scope WHEN 'system' THEN 1 WHEN 'company' THEN 2 END/);
  });

  it("computes per-category status (configured / missing / default)", () => {
    expect(ROUTE).toMatch(/configuredCount === 0 \? "default"/);
    expect(ROUTE).toMatch(/configuredCount === fields\.length \? "configured"/);
    expect(ROUTE).toMatch(/: "missing"/);
  });

  it("returns currentValue + effectiveValue separately", () => {
    // currentValue: NULL when operator hasn't set anything.
    // effectiveValue: falls back to the catalog default so the
    // FE renders a populated input.
    expect(ROUTE).toMatch(/currentValue: raw === undefined \? null : raw/);
    expect(ROUTE).toMatch(/effectiveValue: raw === undefined \? \(f\.defaultValue \?\? null\) : raw/);
  });
});

describe("API — PUT /settings/policies/:categoryId", () => {
  it("validates categoryId against ALL_POLICY_IDS", () => {
    expect(ROUTE).toMatch(/!ALL_POLICY_IDS\.includes\(categoryId\)/);
  });

  it("whitelist-checks the keys in the payload (no dead settings)", () => {
    expect(ROUTE).toMatch(/const knownKeys = new Set\(cat\.fields\.map\(\(f\) => f\.key\)\)/);
    expect(ROUTE).toMatch(/!knownKeys\.has\(k\)/);
    expect(ROUTE).toMatch(/الحقل ".*" غير معروف في فئة/);
  });

  it("persists per-key via upsertSetting at company scope", () => {
    expect(ROUTE).toMatch(/await upsertSetting\("company", scope\.companyId, `umrah\.\$\{categoryId\}\.\$\{k\}`, v\)/);
  });

  it("emits an audit row for the save", () => {
    // U-07 Phase 18 — converted to the IGOC auditFromRequest helper (positional
    // entity arg) when carved into umrah-settings.ts.
    expect(ROUTE).toMatch(/auditFromRequest\(\s*req,\s*"update",\s*"umrah_settings_policies"/);
  });
});

describe("FE — PoliciesTab", () => {
  it("fetches /umrah/settings/policies", () => {
    expect(TAB).toMatch(/`\/umrah\/settings\/policies`|"\/umrah\/settings\/policies"/);
  });

  it("renders one card per category with a status badge + toggle", () => {
    expect(TAB).toMatch(/data-testid=\{`policy-card-\$\{category\.id\}`\}/);
    expect(TAB).toMatch(/data-testid=\{`policy-status-\$\{category\.id\}`\}/);
    expect(TAB).toMatch(/data-testid=\{`policy-toggle-\$\{category\.id\}`\}/);
  });

  it("default-expands the 'missing' status categories so the operator sees gaps first", () => {
    expect(TAB).toMatch(/useState<boolean>\(category\.status === "missing"\)/);
  });

  it("PUTs through useToast + per-category save button", () => {
    expect(TAB).toMatch(/`\/umrah\/settings\/policies\/\$\{category\.id\}`/);
    expect(TAB).toMatch(/method: "PUT"/);
    expect(TAB).toMatch(/data-testid=\{`policy-save-\$\{category\.id\}`\}/);
  });

  it("renders each field with a deterministic testid (full key)", () => {
    expect(TAB).toMatch(/const testId = `policy-field-\$\{field\.fullKey\}`/);
  });

  it("supports number / boolean / select / text inputs", () => {
    expect(TAB).toMatch(/if \(field\.type === "boolean"\)/);
    expect(TAB).toMatch(/if \(field\.type === "select" && field\.options\)/);
    expect(TAB).toMatch(/type=\{field\.type === "number" \? "number" : "text"\}/);
  });

  it("number field converts empty string to null (clears the setting)", () => {
    // Operator clearing the field should reset to catalog default,
    // not persist 0.
    expect(TAB).toMatch(/onChange\(v === "" \? null : Number\(v\)\)/);
  });

  it("status badges color the card by severity", () => {
    expect(TAB).toMatch(/configured: "bg-emerald-100/);
    expect(TAB).toMatch(/missing:\s*"bg-amber-100/);
    expect(TAB).toMatch(/default:\s*"bg-slate-100/);
  });
});

describe("FE — settings page embeds the policies tab", () => {
  it("imports PoliciesTab", () => {
    expect(SETTINGS_PAGE).toMatch(/import \{ PoliciesTab \} from "@\/components\/umrah\/policies-tab"/);
  });

  it("renders <PoliciesTab /> in a card", () => {
    expect(SETTINGS_PAGE).toMatch(/<PoliciesTab \/>/);
    expect(SETTINGS_PAGE).toMatch(/سياسات العمرة \(11 فئة\)/);
  });
});
