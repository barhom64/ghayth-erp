import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the visa-expiring filter + banner — the daily compliance siren
 * so operators chase soon-expiring pilgrims BEFORE the visa expires
 * (and the status flips to "violated" with the KSA overstay fine).
 *
 *   - GET /umrah/pilgrims accepts ?visaExpiringWithin=N (1..90 days)
 *     and narrows to rows whose visaExpiry falls in [today, today+N]
 *     AND whose status isn't already departed/cancelled.
 *
 *   - Bounds 1..90 days so a typo like "9999" doesn't return the
 *     whole season — defensive clamp on the server.
 *
 *   - The export.csv endpoint honors the same filter so a "soon-
 *     expiring" manifest can be downloaded without leaving the UI.
 *
 *   - The pilgrims page renders a banner with a live count + click-
 *     to-filter button. Banner only shows when count > 0 (no banner
 *     noise when there's nothing to chase).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("GET /umrah/pilgrims — visaExpiringWithin filter", () => {
  it("destructures visaExpiringWithin from req.query", () => {
    expect(ROUTE).toMatch(/\{[^}]*\bvisaExpiringWithin\b[^}]*\}\s*=\s*req\.query/);
  });

  it("clamps the day window to [1, 90] so a typo can't return the season", () => {
    expect(ROUTE).toMatch(/Math\.max\(1,\s*Math\.min\(90,\s*Number\(visaExpiringWithin\) \|\| 7\)\)/);
  });

  it("filter uses CURRENT_DATE math so the boundary tracks server clock", () => {
    // The Postgres CURRENT_DATE + interval is the only safe way to
    // compute "today + N days" without DST / TZ drift; the route
    // shouldn't compute the upper bound in JS and pass a string.
    expect(ROUTE).toMatch(/p\."visaExpiry" >= CURRENT_DATE/);
    expect(ROUTE).toMatch(/p\."visaExpiry" <= CURRENT_DATE \+ \(\$\$\{params\.length\} \|\| ' days'\)::interval/);
  });

  it("excludes already-departed / cancelled rows — their visa is operationally moot", () => {
    expect(ROUTE).toMatch(/p\.status NOT IN \('departed','cancelled'\)/);
  });

  it("export.csv honors the same visaExpiringWithin filter", () => {
    // Without this, the operator would click banner → see filtered
    // table → export → get the UNFILTERED season as the manifest.
    const m = ROUTE.match(/router\.get\("\/pilgrims\/export\.csv"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\bvisaExpiringWithin\b/);
  });
});

describe("pilgrims page — visa-expiring banner", () => {
  it("issues an independent count query so the banner shows regardless of active filters", () => {
    expect(PAGE).toContain('"umrah-pilgrims-visa-expiring"');
    expect(PAGE).toContain('/umrah/pilgrims?visaExpiringWithin=7&limit=1');
  });

  it("banner renders only when count > 0 (no noise on a clean day)", () => {
    expect(PAGE).toMatch(/visaSoonCount > 0 && \(/);
    expect(PAGE).toContain("معتمر تنتهي تأشيرتهم خلال ٧ أيام");
    expect(PAGE).toContain('data-testid="pilgrims-visa-expiring-banner"');
  });

  it("click-to-filter button is a toggle (apply ↔ clear)", () => {
    expect(PAGE).toContain('data-testid="pilgrims-visa-expiring-filter"');
    expect(PAGE).toMatch(/const next = visaExpiringWithin === "7" \? "" : "7"/);
    expect(PAGE).toMatch(/visaExpiringWithin === "7" \? "إلغاء التصفية" : "عرضهم"/);
  });

  it("filter rides on the same URL plumbing as the other filters", () => {
    expect(PAGE).toMatch(/visaExpiringWithin=\$\{encodeURIComponent\(visaExpiringWithin\)\}/);
    expect(PAGE).toMatch(/\["umrah-pilgrims",[\s\S]{0,400}visaExpiringWithin,/);
  });

  it("export carries visaExpiringWithin too so the filtered manifest survives the download", () => {
    const m = PAGE.match(/onExportCSV=\{\(\) => \{[\s\S]{1,800}\}\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("visaExpiringWithin");
  });
});
