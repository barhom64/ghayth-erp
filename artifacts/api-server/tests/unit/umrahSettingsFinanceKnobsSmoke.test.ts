import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §8 of #1870 — the three finance-hygiene knobs shipped in §6
 * (VAT rate + VAT mode) and §5 (commission via HR) are exposed
 * through the same /umrah/settings GET + PATCH endpoint that already
 * surfaces the supplier link + product mappings + overstay penalties.
 * The operator now flips them from the settings page instead of
 * SQL.
 *
 *   umrahVatRate    — number, persisted as system_settings.umrah_vat_rate
 *   umrahVatMode    — 'inclusive' | 'exclusive', persisted as umrah_vat_mode
 *   commissionViaHr — boolean,    persisted as commission_via_hr ('true'/'false')
 *
 * Failure modes pinned:
 *   • A future refactor that drops one of the keys from the GET → the
 *     UI shows null and the operator can't tell what mode the engine
 *     is actually in.
 *   • A future refactor that loses the boolean→string serialisation on
 *     commission_via_hr → the engine's `!== "false"` check would see
 *     "true" / "false" / undefined / "[object Object]" inconsistently.
 *   • A schema change that breaks the explicit-null clear path → the
 *     operator couldn't revert to engine defaults.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("§8 — umrahSettingsPatchSchema accepts the 3 new knobs", () => {
  it("umrahVatRate uses nullableNumberPreproc (number | null | undefined — clear-to-default supported)", () => {
    expect(ROUTE).toMatch(/umrahVatRate: nullableNumberPreproc/);
  });

  it("umrahVatMode is a strict enum ('inclusive' | 'exclusive') so the engine doesn't see typos", () => {
    expect(ROUTE).toMatch(/umrahVatMode: z\.preprocess\([\s\S]{0,200}z\.enum\(\["inclusive", "exclusive"\]\)/);
  });

  it("commissionViaHr is a strict boolean — coerced to string at persist time", () => {
    expect(ROUTE).toMatch(/commissionViaHr: z\.preprocess\([\s\S]{0,200}z\.boolean\(\)/);
  });
});

describe("§8 — GET /umrah/settings returns the 3 new knobs", () => {
  it("SELECT pulls all 3 keys alongside the legacy overstay-penalty keys", () => {
    expect(ROUTE).toMatch(/'umrah_vat_rate'/);
    expect(ROUTE).toMatch(/'umrah_vat_mode'/);
    expect(ROUTE).toMatch(/'commission_via_hr'/);
  });

  it("response payload surfaces umrahVatRate / umrahVatMode / commissionViaHr at the top level", () => {
    expect(ROUTE).toMatch(/umrahVatRate,\s*\n\s*umrahVatMode,\s*\n\s*commissionViaHr,/);
  });

  it("VAT mode default is 'inclusive' when unset (matches the engine's default per the operator's directive)", () => {
    expect(ROUTE).toMatch(/r\.value === "exclusive" \? "exclusive" : "inclusive"/);
  });

  it("commission_via_hr deserialises with `!== \"false\"` so default stays true on absent/unknown values", () => {
    expect(ROUTE).toMatch(/commissionViaHr = r\.value !== "false"/);
  });
});

describe("§8 — PATCH /umrah/settings persists the 3 new knobs", () => {
  it("settingsFields array adds all 3 keys (the loop handles upsert + null-clear)", () => {
    expect(ROUTE).toMatch(/\["umrah_vat_rate",\s*b\.umrahVatRate\]/);
    expect(ROUTE).toMatch(/\["umrah_vat_mode",\s*b\.umrahVatMode\]/);
    expect(ROUTE).toMatch(/\["commission_via_hr",[\s\S]{0,200}b\.commissionViaHr/);
  });

  it("commission_via_hr boolean is serialised to 'true'/'false' string for system_settings.value", () => {
    // The engine reads this as `r.value !== "false"` so the format
    // must be the literal "true" / "false" string.
    expect(ROUTE).toMatch(/typeof b\.commissionViaHr === "boolean" \? \(b\.commissionViaHr \? "true" : "false"\) : b\.commissionViaHr/);
  });

  it("keyToAuditField maps the new keys to camelCase for the audit log + response echo", () => {
    expect(ROUTE).toMatch(/"umrah_vat_rate":\s*"umrahVatRate"/);
    expect(ROUTE).toMatch(/"umrah_vat_mode":\s*"umrahVatMode"/);
    expect(ROUTE).toMatch(/"commission_via_hr":\s*"commissionViaHr"/);
  });

  it("explicit null clears the company-scoped row (DELETE → reverts to engine default)", () => {
    // Existing settings-loop already handles the null-clear path via
    // `if (value === null) DELETE …`. Pin that we're still using the
    // same loop for the new fields (no parallel branch).
    expect(ROUTE).toMatch(/if \(value === null\) \{\s*await rawExecute\(\s*`DELETE FROM system_settings/);
  });
});
