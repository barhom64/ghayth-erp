import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §6 (Deep Finance Integration) — GL drill-through:
 *   GET /umrah/journal/:sourceType/:sourceId
 *
 * Closes the loop between an umrah operational source (sales invoice,
 * NUSK invoice, payment, agent invoice, penalty) and its posted GL
 * journal entry. Lets the auditor answer "هل ترحَّل صح؟ على أي حساب؟"
 * without leaving the source's detail page.
 *
 * Source whitelist (5 types) — opens with NotFoundError-style 400 for
 * any other type so we never expose a non-umrah table through this path.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const CARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/umrah-journal-drill-card.tsx"),
  "utf8",
);
const INVOICE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-invoice-detail.tsx"),
  "utf8",
);
const PENALTY_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-penalty-detail.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/journal\/:sourceType\/:sourceId"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("journal drill handler not found");
  return m[0];
})();

describe("GET /umrah/journal/:sourceType/:sourceId — endpoint contract", () => {
  it("registers under feature: umrah, action: view (read-only drill)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("only the 5 whitelisted source types are reachable (no SQL injection via :sourceType)", () => {
    // The whitelist mapping is in the same file. Pin each entry.
    expect(ROUTE).toMatch(/JOURNAL_DRILL_SOURCES[\s\S]{0,200}umrah_sales_invoices/);
    expect(ROUTE).toMatch(/JOURNAL_DRILL_SOURCES[\s\S]{0,600}umrah_nusk_invoices/);
    expect(ROUTE).toMatch(/JOURNAL_DRILL_SOURCES[\s\S]{0,600}umrah_payments/);
    expect(ROUTE).toMatch(/JOURNAL_DRILL_SOURCES[\s\S]{0,600}umrah_agent_invoices/);
    expect(ROUTE).toMatch(/JOURNAL_DRILL_SOURCES[\s\S]{0,600}umrah_penalties/);
    // Reject any unknown type with a clear validation error
    expect(HANDLER).toMatch(/if \(!meta\) throw new ValidationError/);
  });

  it("source row is read first (tenant-scoped) — confirms ownership BEFORE journal read", () => {
    expect(HANDLER).toMatch(/WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/if \(!source\) throw new NotFoundError/);
  });

  it("when journalEntryId is null, returns a graceful 'not posted yet' message — not an error", () => {
    // Operator sees "no journal" rather than a 500 — this is a normal state
    // for invoices in draft / pending review.
    expect(HANDLER).toMatch(/if \(!journalEntryId\)/);
    expect(HANDLER).toMatch(/journal: null/);
    expect(HANDLER).toMatch(/message:[\s\S]{0,200}لم يتم ترحيل قيد محاسبي/);
  });

  it("header + lines fetched in parallel — single RTT after the source check", () => {
    expect(HANDLER).toMatch(/const \[headerArr, lines\] = await Promise\.all\(/);
  });

  it("journal_entries scoped on companyId (defence-in-depth even though FK is single-tenant)", () => {
    expect(HANDLER).toMatch(/FROM journal_entries je[\s\S]{0,400}AND je\."companyId" = \$2/);
    expect(HANDLER).toMatch(/je\."deletedAt" IS NULL/);
  });

  it("journal_lines join chart_of_accounts (tenant-safe) for the human Arabic account name", () => {
    expect(HANDLER).toMatch(/LEFT JOIN chart_of_accounts coa\s+ON coa\.code = jl\."accountCode"\s+AND coa\."companyId" = \$2/);
    expect(HANDLER).toMatch(/coa\.name\s+AS "accountName"/);
  });

  it("orphan FK (journal entry deleted) surfaces with orphanJournalEntryId — not silent gap", () => {
    // Critical: if the engine wrote the FK but the journal entry was later
    // soft-deleted, we MUST surface that to the auditor rather than show
    // "no journal posted yet" (which would be a lie).
    expect(HANDLER).toMatch(/orphanJournalEntryId: journalEntryId/);
    expect(HANDLER).toMatch(/قد يكون محذوفاً/);
  });

  it("totals (debit/credit) computed JS-side + isBalanced flag for the auditor", () => {
    expect(HANDLER).toMatch(/totals = lines\.reduce/);
    expect(HANDLER).toMatch(/debit:\s*acc\.debit/);
    expect(HANDLER).toMatch(/credit:\s*acc\.credit/);
    expect(HANDLER).toMatch(/isBalanced: Math\.abs\(totals\.debit - totals\.credit\) < 0\.01/);
  });

  it("lines carry every dimension the engine emits (drill-by-agent / season / dept)", () => {
    // umrahAgentId + umrahSeasonId are the umrah-specific dims;
    // costCenter + departmentId etc are the general-finance dims.
    expect(HANDLER).toMatch(/"umrahSeasonId"/);
    expect(HANDLER).toMatch(/"umrahAgentId"/);
    expect(HANDLER).toMatch(/"costCenter"/);
    expect(HANDLER).toMatch(/"departmentId"/);
    expect(HANDLER).toMatch(/"projectId"/);
    expect(HANDLER).toMatch(/"employeeId"/);
  });

  it("response shape: source + journal + lines + totals + isBalanced", () => {
    expect(HANDLER).toMatch(/source:\s*\{[\s\S]{0,200}id: sourceId,\s*sourceType,\s*ref: source\.ref,\s*status: source\.status\s*\}/);
    expect(HANDLER).toMatch(/journal: header/);
    expect(HANDLER).toMatch(/lines,/);
    expect(HANDLER).toMatch(/totals,/);
    expect(HANDLER).toMatch(/isBalanced:/);
  });
});

describe("UmrahJournalDrillCard — FE wiring + empty/error states", () => {
  it("queries the drill endpoint with sourceType + sourceId in the cache key", () => {
    expect(CARD).toContain("/umrah/journal/${sourceType}/${sourceId}");
    expect(CARD).toMatch(/\["umrah-journal-drill", sourceType, String\(sourceId\)\]/);
  });

  it("empty state surfaces 'not posted yet' + the orphan badge when relevant", () => {
    expect(CARD).toContain('data-testid="umrah-journal-drill-card-empty"');
    expect(CARD).toContain("لم يتم ترحيل قيد محاسبي");
    expect(CARD).toContain('data-testid="umrah-journal-drill-orphan"');
  });

  it("happy-path card surfaces the JE header + balanced flag + opens the JE in finance", () => {
    expect(CARD).toContain('data-testid="umrah-journal-drill-card"');
    expect(CARD).toContain('data-testid="umrah-journal-drill-balanced"');
    expect(CARD).toContain('data-testid="umrah-journal-drill-imbalanced"');
    expect(CARD).toContain('data-testid="umrah-journal-drill-link"');
    expect(CARD).toContain("/finance/journal-entries/${journal.id}");
  });

  it("reversed journals surface the reversal banner with reason + date", () => {
    expect(CARD).toContain('data-testid="umrah-journal-drill-reversed"');
    expect(CARD).toContain("القيد منعكس بقيد #");
  });

  it("each GL line shows account code + name + debit/credit + dimensions", () => {
    expect(CARD).toContain('data-testid="umrah-journal-drill-table"');
    expect(CARD).toContain("data-testid={`umrah-journal-drill-line-${l.id}`}");
    expect(CARD).toContain("data-testid={`umrah-journal-drill-debit-${l.id}`}");
    expect(CARD).toContain("data-testid={`umrah-journal-drill-credit-${l.id}`}");
    // Umrah-specific dimensions surface as Arabic badges
    expect(CARD).toContain("وكيل #");
    expect(CARD).toContain("موسم #");
  });

  it("tfoot shows totals — auditor's eye for trial-balance proof", () => {
    expect(CARD).toContain('data-testid="umrah-journal-drill-total-debit"');
    expect(CARD).toContain('data-testid="umrah-journal-drill-total-credit"');
  });
});

describe("Invoice detail page — drill card wired", () => {
  it("imports the card + renders it for the invoice's id", () => {
    expect(INVOICE_PAGE).toContain('import { UmrahJournalDrillCard } from "@/components/shared/umrah-journal-drill-card"');
    expect(INVOICE_PAGE).toContain('sourceType="umrah_agent_invoices"');
    expect(INVOICE_PAGE).toContain("sourceId={id}");
  });
});

describe("Penalty detail page — drill card wired", () => {
  it("imports the card + renders it with sourceType=umrah_penalties", () => {
    expect(PENALTY_PAGE).toContain('import { UmrahJournalDrillCard } from "@/components/shared/umrah-journal-drill-card"');
    expect(PENALTY_PAGE).toContain('sourceType="umrah_penalties"');
    expect(PENALTY_PAGE).toContain("sourceId={id}");
  });
});
