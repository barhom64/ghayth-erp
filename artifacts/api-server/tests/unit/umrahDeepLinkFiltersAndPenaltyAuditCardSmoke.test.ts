import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins three close-the-loop follow-ups for the compliance dashboard
 * (#1502):
 *
 * (1) Compliance "visa-expiring" tile was deep-linking with the wrong
 *     query param shape (?visaExpiring=7d) — the backend accepts
 *     `visaExpiringWithin` (numeric days). The deep-link silently fell
 *     through to an unfiltered list.
 *
 * (2) /umrah/pilgrims + /umrah/penalties pages did not read URL params
 *     on mount. Compliance tiles, the visa-expiring banner, and any
 *     bookmark-driven link landed on an unfiltered list because
 *     `useFilters` initialises from a static dict.
 *
 * (3) Penalty detail page now consumes the new audit-trail fields
 *     shipped on /penalties/:id in #1502 (createdByName / updatedByName
 *     / journalEntryRef / invoiceRef + seasonTitle deep-link).
 */
const COMPLIANCE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/compliance.tsx"),
  "utf8",
);
const PILGRIMS_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);
const PENALTIES_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/penalties.tsx"),
  "utf8",
);
const PENALTY_DETAIL = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-penalty-detail.tsx"),
  "utf8",
);

describe("compliance dashboard — corrected deep-link contract", () => {
  it("visa tile now uses ?visaExpiringWithin=7 (matches the backend param)", () => {
    // Backend `/umrah/pilgrims` accepts `visaExpiringWithin` (numeric
    // days). The original `?visaExpiring=7d` from #1502 was a no-op.
    expect(COMPLIANCE_PAGE).toMatch(/`\/umrah\/pilgrims\?visaExpiringWithin=7\$\{seasonAmp\}`/);
    // And the broken shape is gone from any HREF (the comment block
    // still references it as the cautionary tale, which is fine).
    expect(COMPLIANCE_PAGE).not.toMatch(/href:\s*`[^`]*visaExpiring=7d/);
    expect(COMPLIANCE_PAGE).not.toMatch(/href=`[^`]*visaExpiring=7d/);
  });

  it("overstay + penalties tiles still use the supported query shape", () => {
    expect(COMPLIANCE_PAGE).toMatch(/`\/umrah\/pilgrims\?status=overstayed\$\{seasonAmp\}`/);
    expect(COMPLIANCE_PAGE).toMatch(/`\/umrah\/penalties\?status=pending\$\{seasonAmp\}`/);
  });
});

describe("/umrah/pilgrims — URL-param bootstrap (deep-link support)", () => {
  it("imports useEffect for the mount-only URL parse", () => {
    expect(PILGRIMS_PAGE).toMatch(/import \{ useState, useEffect \} from "react"/);
  });

  it("reads the known filter keys from window.location on mount", () => {
    // The known list must include every key the compliance dashboard
    // links can carry. If a new key is added to the dashboard but
    // forgotten here, this pin fails — keeping the two surfaces in
    // sync.
    expect(PILGRIMS_PAGE).toMatch(/new URLSearchParams\(window\.location\.search\)/);
    for (const key of ["status", "seasonId", "agentId", "groupId", "flight", "arrivalDate", "departureDate", "visaExpiringWithin", "search"]) {
      expect(PILGRIMS_PAGE).toMatch(new RegExp(`"${key}"`));
    }
  });

  it("runs the URL parse exactly once (empty deps array)", () => {
    // Without empty deps the URL parse would re-fire on every state
    // change and clobber operator-applied filters. Pin the // eslint-
    // disable comment + the `, []);` close so a refactor that adds
    // deps fails this assertion loudly.
    expect(PILGRIMS_PAGE).toMatch(/eslint-disable-next-line react-hooks\/exhaustive-deps[\s\S]{0,40}\}, \[\]\);/);
  });

  it("only writes to filters when at least one known key is present", () => {
    // Optimisation + correctness: an unrelated URL shouldn't trigger
    // a state update. The `touched` boolean guards the write.
    expect(PILGRIMS_PAGE).toMatch(/if \(touched\) setFilters\(\{ \.\.\.filters, \.\.\.next \} as any\)/);
  });
});

describe("/umrah/penalties — URL-param bootstrap (compliance-tile target)", () => {
  it("imports useEffect for the bootstrap hook", () => {
    expect(PENALTIES_PAGE).toMatch(/import \{ useState, useEffect \} from "react"/);
  });

  it("reads only status + seasonId from URL (no overshoot)", () => {
    // Penalties only takes two filter params — pinning the narrow
    // list so a future refactor doesn't accidentally widen it.
    expect(PENALTIES_PAGE).toMatch(/for \(const k of \["status", "seasonId"\]\)/);
    expect(PENALTIES_PAGE).toMatch(/eslint-disable-next-line react-hooks\/exhaustive-deps[\s\S]{0,40}\}, \[\]\);/);
  });
});

describe("penalty detail — audit-trail card consumes the #1502 endpoint", () => {
  it("imports the new icons + the wouter Link for the cross-page jumps", () => {
    expect(PENALTY_DETAIL).toMatch(/import \{ AlertTriangle, Users, Calendar, FileText, Receipt \} from "lucide-react"/);
    expect(PENALTY_DETAIL).toMatch(/import \{ Link \} from "wouter"/);
  });

  it("audit card hidden when ALL four enrichment fields are empty (no empty box)", () => {
    // Same anti-empty-card pattern we use on the pilgrim timeline.
    // A brand-new penalty with no updates / no posted JE / no
    // invoice yet shouldn't render an empty card.
    expect(PENALTY_DETAIL).toMatch(/penalty\?\.createdByName \|\| penalty\?\.updatedByName \|\| penalty\?\.journalEntryRef \|\| penalty\?\.invoiceRef/);
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-audit-card"');
  });

  it("renders createdByName + updatedByName from the endpoint", () => {
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-created-by"');
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-updated-by"');
    expect(PENALTY_DETAIL).toMatch(/penalty\.createdByName/);
    expect(PENALTY_DETAIL).toMatch(/penalty\.updatedByName/);
  });

  it("journalEntryRef links to /finance/journal-manual/:id when present", () => {
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-journal-link"');
    expect(PENALTY_DETAIL).toMatch(/href=\{`\/finance\/journal-manual\/\$\{penalty\.journalEntryId\}`\}/);
    expect(PENALTY_DETAIL).toMatch(/penalty\.journalEntryRef/);
  });

  it("invoiceRef links to /umrah/invoices/:id when present", () => {
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-invoice-link"');
    expect(PENALTY_DETAIL).toMatch(/href=\{`\/umrah\/invoices\/\$\{penalty\.invoiceId\}`\}/);
    expect(PENALTY_DETAIL).toMatch(/penalty\.invoiceRef/);
  });

  it("status card now surfaces seasonTitle with a deep-link when seasonId is set", () => {
    // Closes the season → penalty navigation loop. Operator on the
    // penalty page can jump straight to the season detail.
    expect(PENALTY_DETAIL).toContain('data-testid="penalty-season-link"');
    expect(PENALTY_DETAIL).toMatch(/href=\{`\/umrah\/seasons\/\$\{penalty\.seasonId\}`\}/);
  });
});
