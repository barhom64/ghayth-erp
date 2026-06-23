import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §9 of #1870 — System-as-Assistant Suggestions.
 *
 * Pins:
 *   1. Engine module declares the six Phase-1 suggestion types.
 *   2. /umrah/assistant/suggestions route exists + calls the engine.
 *   3. AssistantHints component renders suggestions + dismiss + drill-down.
 *   4. Dashboard embeds the component above the quick-actions row.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahAssistantEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/umrah/assistant-hints.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/dashboard.tsx"),
  "utf8",
);

const SUGGESTION_TYPES = [
  "unlinked_rows_recovery",
  "missing_finance_postings",
  "visa_expiring_attention",
  "active_overstayers",
  "group_needs_transport",
  "import_batch_review",
] as const;

describe("engine — six Phase-1 suggestion types", () => {
  it("SuggestionType union covers all six", () => {
    expect(ENGINE).toMatch(/export type SuggestionType =/);
    for (const t of SUGGESTION_TYPES) {
      expect(ENGINE).toContain(`"${t}"`);
    }
  });

  it("severity-ordered output (critical → warning → info)", () => {
    expect(ENGINE).toMatch(/critical: 0, warning: 1, info: 2/);
    expect(ENGINE).toMatch(/suggestions\.sort/);
  });

  it("each suggestion carries actionUrl + actionLabel + body", () => {
    for (const field of ["title", "body", "severity", "actionUrl", "actionLabel"]) {
      expect(ENGINE).toMatch(new RegExp(`${field}:`));
    }
  });

  it("missing_finance_postings is critical (finance integrity)", () => {
    const block = ENGINE.match(/type: "missing_finance_postings"[\s\S]{0,300}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/severity: "critical"/);
  });

  it("active_overstayers is critical", () => {
    const block = ENGINE.match(/type: "active_overstayers"[\s\S]{0,300}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/severity: "critical"/);
  });
});

describe("engine — SQL probes", () => {
  it("six probes run in parallel via Promise.all", () => {
    expect(ENGINE).toMatch(/const \[\s*[\r\n]+\s*orphanRow, missingApRow, visaRow, overstayRow, groupNoTransportRow, errorBatchRow,\s*[\r\n]+\s*\] = await Promise\.all/);
  });

  it("group-needs-transport joins through transport_bookings.umrahGroupId", () => {
    // Uses the Service Contract table from §7 — confirms the
    // assistant respects the same boundary.
    expect(ENGINE).toMatch(/NOT EXISTS \(\s*[\r\n]+\s*SELECT 1 FROM transport_bookings b/);
    expect(ENGINE).toMatch(/b\."umrahGroupId" = g\.id/);
  });

  it("missing_finance_postings excludes cancelled + zero-amount nusk invoices", () => {
    expect(ENGINE).toMatch(/AND n\."purchaseInvoiceId" IS NULL/);
    expect(ENGINE).toMatch(/AND n\."nuskStatus" <> 'cancelled'/);
    expect(ENGINE).toMatch(/AND COALESCE\(n\."totalAmount",0\) > 0/);
  });

  it("error-batch window is 30 days", () => {
    expect(ENGINE).toMatch(/AND b\."createdAt" >= NOW\(\) - INTERVAL '30 days'/);
  });
});

describe("route — /umrah/assistant/suggestions", () => {
  it("declares the route + threads seasonId from the query", () => {
    expect(ROUTE).toMatch(/router\.get\("\/assistant\/suggestions"/);
    expect(ROUTE).toMatch(/const seasonId = req\.query\.seasonId \? Number\(req\.query\.seasonId\) : null/);
    expect(ROUTE).toMatch(/await getDashboardSuggestions\(/);
  });
});

describe("FE — AssistantHints component", () => {
  it("fetches the suggestions endpoint", () => {
    expect(COMPONENT).toMatch(/`\/umrah\/assistant\/suggestions\$\{qs\}`/);
  });

  it("each card carries a deterministic data-testid", () => {
    expect(COMPONENT).toMatch(/data-testid=\{`assistant-suggestion-\$\{s\.type\}`\}/);
    expect(COMPONENT).toMatch(/data-testid=\{`assistant-action-\$\{s\.type\}`\}/);
    expect(COMPONENT).toMatch(/data-testid=\{`assistant-dismiss-\$\{s\.type\}`\}/);
  });

  it("supports per-tenant dismissal of individual hints", () => {
    // The dismiss is local (useState); doesn't persist across
    // sessions on purpose — fresh state every login so a hint
    // dismissed by mistake reappears.
    expect(COMPONENT).toMatch(/const \[dismissed, setDismissed\] = useState<Set<string>>/);
    expect(COMPONENT).toMatch(/!dismissed\.has\(s\.type\)/);
  });

  it("returns null when there are no visible suggestions (zero noise)", () => {
    expect(COMPONENT).toMatch(/if \(visible\.length === 0\) return null/);
  });

  it("visibleLimit defaults to 5 with an expand/collapse toggle", () => {
    expect(COMPONENT).toMatch(/visibleLimit = 5/);
    expect(COMPONENT).toMatch(/data-testid="assistant-expand"/);
    expect(COMPONENT).toMatch(/data-testid="assistant-collapse"/);
  });

  it("severity drives the card border color", () => {
    expect(COMPONENT).toMatch(/SEV_CLASSES: Record<SuggestionSeverity, string>/);
    expect(COMPONENT).toMatch(/critical: "border-rose-300/);
    expect(COMPONENT).toMatch(/warning:\s*"border-amber-300/);
    expect(COMPONENT).toMatch(/info:\s*"border-sky-300/);
  });
});

describe("FE — dashboard embeds AssistantHints", () => {
  it("imports the component", () => {
    expect(DASHBOARD).toMatch(/import \{ AssistantHints \} from "@\/components\/umrah\/assistant-hints"/);
  });

  it("renders <AssistantHints /> above the quick-actions section", () => {
    expect(DASHBOARD).toMatch(/<AssistantHints \/>/);
  });
});
