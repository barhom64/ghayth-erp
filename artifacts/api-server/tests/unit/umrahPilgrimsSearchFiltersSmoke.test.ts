import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the pilgrim-list search + filter improvements:
 *
 *   - GET /umrah/pilgrims accepts `groupId` + `nationality` query params
 *     so operators can drill the list to one group / one country.
 *
 *   - The `search` clause now also matches `nuskNumber` (the operator's
 *     primary identifier) — pre-PR only fullName + passport_hash +
 *     visa_hash were searched, which silently blocked NUSK lookups.
 *
 *   - The pilgrims page exposes seasonId + groupId via the existing
 *     AdvancedFilters extraFilters slot, and the search placeholder
 *     mentions NUSK so operators know it's searchable.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("/umrah/pilgrims — search + filter coverage", () => {
  it("destructures the new query params alongside the existing ones", () => {
    expect(ROUTE).toMatch(/\{\s*seasonId,\s*status,\s*agentId,\s*groupId,\s*nationality,\s*search/);
  });

  it("groupId is filtered by equality on p.\"groupId\"", () => {
    expect(ROUTE).toMatch(/if \(groupId\) \{[\s\S]{0,200}p\."groupId"=\$\$\{params\.length\}/);
  });

  it("nationality is filtered by ILIKE so 'SA' / 'SAUDI' / 'Saudi Arabia' all match", () => {
    // Vendor files vary wildly on country format; an equality filter
    // would silently drop most matches.
    expect(ROUTE).toMatch(/if \(nationality\) \{[\s\S]{0,300}p\.nationality ILIKE \$\$\{params\.length\}/);
  });

  it("search clause now also matches nuskNumber via ILIKE", () => {
    // The OR clause includes p."nuskNumber" alongside fullName and the
    // two blind-indexed columns. Pre-PR NUSK numbers weren't searchable
    // even though operators routinely identify pilgrims by them.
    expect(ROUTE).toMatch(/p\."fullName" ILIKE \$\$\{likePh\} OR p\."nuskNumber" ILIKE \$\$\{likePh\} OR p\."passportNumber_hash" = \$\$\{hashPh\} OR p\."visaNumber_hash" = \$\$\{hashPh\}/);
  });

  it("existing pagination + sort behaviour is unchanged (regression guard)", () => {
    // The richer filters must not regress the LIMIT / OFFSET pagination
    // or the createdAt DESC ordering that the table assumes.
    expect(ROUTE).toMatch(/ORDER BY p\."createdAt" DESC LIMIT/);
    expect(ROUTE).toMatch(/const perPage = Math\.min\(Math\.max\(Number\(limit\) \|\| 20, 1\), 100\)/);
  });
});

describe("pilgrims page — UI surfaces the new filters", () => {
  it("seasons + groups are fetched so the dropdowns can render their options", () => {
    expect(PAGE).toContain('"/umrah/seasons"');
    expect(PAGE).toContain('"/umrah/groups"');
  });

  it("seasonId + groupId ride along on the filters dict and ship on every refetch", () => {
    // The query URL must carry them so the backend filter clauses
    // actually run; without it the dropdown would be cosmetic.
    expect(PAGE).toMatch(/seasonId=\$\{encodeURIComponent\(seasonId\)\}/);
    expect(PAGE).toMatch(/groupId=\$\{encodeURIComponent\(groupId\)\}/);
  });

  it("react-query key includes the new filter values so a change refetches", () => {
    // Without the keys, switching season would show stale data from the
    // previous season's cache hit.
    expect(PAGE).toMatch(/\["umrah-pilgrims",[\s\S]{0,200}seasonId,\s*groupId,/);
  });

  it("AdvancedFilters extraFilters exposes seasonId + groupId dropdowns", () => {
    expect(PAGE).toMatch(/extraFilters:\s*\[/);
    expect(PAGE).toMatch(/key:\s*"seasonId",\s*label:\s*"الموسم"/);
    expect(PAGE).toMatch(/key:\s*"groupId",\s*label:\s*"المجموعة"/);
  });

  it("search placeholder mentions NUSK so operators know it's searchable", () => {
    expect(PAGE).toContain("رقم نسك");
  });
});
