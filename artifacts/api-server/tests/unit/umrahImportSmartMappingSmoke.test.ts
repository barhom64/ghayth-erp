import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { suggestColumnMapping, MUTAMER_HEADER_MAP, VOUCHER_HEADER_MAP } from "../../src/lib/umrahImportEngine.js";

/**
 * Pins the smart-mapping suggestion engine — closes the column-mapping
 * loop alongside PR #1411 (custom mapping), #1416 (saved presets), and
 * #1420 (rejected-rows diagnostics).
 *
 * The hardcoded dictionaries cover the standard NUSK / MOFA layouts.
 * When a vendor's file uses a typo / abbreviation / variant of a known
 * header, the operator hits the column-mapping step and has to pick
 * the target field manually. This engine pre-fills the wizard with a
 * fuzzy-matched suggestion + confidence score per unknown header.
 *
 * The algorithm is Levenshtein-distance similarity with an Arabic-
 * aware normaliser; suggestions below MIN_CONFIDENCE (0.6) are
 * suppressed so a wrong guess can't slip through.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("suggestColumnMapping — exact-match short-circuit", () => {
  it("returns confidence=1 + source='exact' for headers IN the dictionary", () => {
    const out = suggestColumnMapping(["رقم المعتمر"], "mutamers");
    expect(out["رقم المعتمر"]).toEqual({
      target: "nuskNumber",
      confidence: 1,
      matchedKey: "رقم المعتمر",
      source: "exact",
    });
  });

  it("trims whitespace before matching (vendor files often pad)", () => {
    // "  رقم المعتمر  " → trimmed → exact match. Same algorithm the
    // existing normalizeImportRows uses, so the wizard's suggestion
    // and the engine's runtime lookup agree on what counts as known.
    const out = suggestColumnMapping(["  رقم المعتمر  "], "mutamers");
    expect(out["  رقم المعتمر  "]?.source).toBe("exact");
    expect(out["  رقم المعتمر  "]?.confidence).toBe(1);
  });

  it("folds Arabic variants: alif-hamza, alif-maksura, ta-marbuta, tatweel", () => {
    // These are all the same word operationally but would be N-char
    // Levenshtein-distant without the folds. The dictionary uses one
    // canonical spelling; the operator's file might use any variant.
    const tests = [
      // hamza variants → plain alif
      { input: "إسم المعتمر", target: "fullName" }, // hamza-on-alif
      { input: "اسم المعتمرة", target: "fullName" }, // ta-marbuta → ha
      // tatweel stripped
      { input: "اسـم المعتمر", target: "fullName" },
    ];
    for (const t of tests) {
      const out = suggestColumnMapping([t.input], "mutamers");
      expect(out[t.input]).toBeDefined();
      expect(out[t.input]?.target).toBe(t.target);
    }
  });
});

describe("suggestColumnMapping — fuzzy-match best suggestion", () => {
  it("suggests the closest dictionary key for a one-typo variant", () => {
    // "رقم المتعمر" (typo of "رقم المعتمر") — Levenshtein 2 vs the
    // canonical; similarity = 1 - 2/12 = 0.83 → above MIN_CONFIDENCE.
    const out = suggestColumnMapping(["رقم المتعمر"], "mutamers");
    expect(out["رقم المتعمر"]).toBeDefined();
    expect(out["رقم المتعمر"]?.target).toBe("nuskNumber");
    expect(out["رقم المتعمر"]?.source).toBe("fuzzy");
    expect(out["رقم المتعمر"]?.confidence).toBeGreaterThan(0.6);
    expect(out["رقم المتعمر"]?.confidence).toBeLessThan(1);
  });

  it("suggestion includes matchedKey so the UI can show 'هل تقصد X؟'", () => {
    const out = suggestColumnMapping(["رقم المتعمر"], "mutamers");
    expect(out["رقم المتعمر"]?.matchedKey).toBe("رقم المعتمر");
  });

  it("SUPPRESSES suggestions below MIN_CONFIDENCE (no wrong guesses)", () => {
    // Garbage input → no dictionary key is close enough → no
    // suggestion. Better silent than wrong — the operator gets the
    // empty-mapping path and picks manually.
    const out = suggestColumnMapping(["Custom Random Column XYZ 123"], "mutamers");
    expect(out["Custom Random Column XYZ 123"]).toBeUndefined();
  });
});

describe("suggestColumnMapping — fileType selects the right dictionary", () => {
  it("mutamers headers don't match voucher dictionary terms", () => {
    // "رقم الفاتورة" is a VOUCHER_HEADER_MAP key. Asking for
    // mutamers should NOT return it as an exact match.
    const out = suggestColumnMapping(["رقم الفاتورة"], "mutamers");
    expect(out["رقم الفاتورة"]?.source).not.toBe("exact");
  });

  it("vouchers headers exact-match the voucher dictionary", () => {
    const out = suggestColumnMapping(["رقم الفاتورة"], "vouchers");
    expect(out["رقم الفاتورة"]?.target).toBe("nuskInvoiceNumber");
    expect(out["رقم الفاتورة"]?.source).toBe("exact");
  });
});

describe("suggestColumnMapping — batch input", () => {
  it("handles many headers in one call (one call per file pick, not per header)", () => {
    const headers = [
      "رقم المعتمر",         // exact
      "اسم المتعمر",         // fuzzy (typo)
      "Custom Garbage XYZ",  // suppressed
      "رقم الجواز",          // exact
    ];
    const out = suggestColumnMapping(headers, "mutamers");
    expect(Object.keys(out).length).toBe(3); // garbage suppressed
    expect(out["رقم المعتمر"]?.confidence).toBe(1);
    expect(out["اسم المتعمر"]?.confidence).toBeLessThan(1);
    expect(out["رقم الجواز"]?.confidence).toBe(1);
    expect(out["Custom Garbage XYZ"]).toBeUndefined();
  });

  it("skips empty / null headers without throwing", () => {
    // Excel sometimes returns "" or undefined for unlabeled columns —
    // the suggestion engine must not crash on those.
    const out = suggestColumnMapping(["", "رقم المعتمر"] as string[], "mutamers");
    expect(out["رقم المعتمر"]?.confidence).toBe(1);
    expect(Object.keys(out).length).toBe(1);
  });
});

describe("dictionary integrity (regression guards)", () => {
  it("MUTAMER_HEADER_MAP + VOUCHER_HEADER_MAP are non-empty", () => {
    // Defence against an accidental empty-dictionary refactor; the
    // suggestion engine would silently return zero suggestions
    // forever otherwise.
    expect(Object.keys(MUTAMER_HEADER_MAP).length).toBeGreaterThan(5);
    expect(Object.keys(VOUCHER_HEADER_MAP).length).toBeGreaterThan(5);
  });
});

describe("POST /umrah/import/suggest-mapping — route surface", () => {
  it("registers under feature: umrah, action: create (matches the import-write path)", () => {
    // The wizard calls this BEFORE the import is confirmed — but it's
    // still part of the create-side flow. Same auth as the rest of the
    // import endpoints (preview, confirm, presets) so RBAC stays
    // uniform.
    expect(ROUTE).toMatch(/router\.post\("\/import\/suggest-mapping",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"create"\s*\}\)/);
  });

  it("zod schema requires headers + fileType (no silent passthrough on empty body)", () => {
    expect(ROUTE).toMatch(/suggestMappingSchema = z\.object\(\{[\s\S]{0,400}headers:\s*z\.array\(z\.string\(\)\)\.min\(1/);
    expect(ROUTE).toMatch(/fileType:\s*z\.enum\(\["mutamers",\s*"vouchers"\]\)/);
  });

  it("delegates to the engine's suggestColumnMapping (no logic in the route)", () => {
    // Routes should be thin — keep the algorithm in the engine so
    // tests + future callers (CLI? scripts?) can use it directly
    // without spinning up Express.
    expect(ROUTE).toMatch(/const \{ suggestColumnMapping \} = await import\("\.\.\/lib\/umrahImportEngine\.js"\)/);
    expect(ROUTE).toMatch(/res\.json\(\{ suggestions: suggestColumnMapping\(headers, fileType\) \}\)/);
  });
});
