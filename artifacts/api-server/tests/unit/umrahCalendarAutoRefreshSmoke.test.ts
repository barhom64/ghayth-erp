import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §4 Phase 3 — Calendar auto-refresh (Charter #1870):
 *   `useApiQuery` now accepts `refetchInterval` so any page can poll
 *   without reaching down to react-query directly.
 *   The umrah calendar uses it to refresh every 60s when the operator
 *   toggles "تحديث تلقائي" on.
 *
 * The toggle is OPT-IN — default OFF so the calendar doesn't burn
 * bandwidth on quiet days. Operator turns it ON when running the daily
 * ops desk.
 */
const API_LIB = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/api.ts"),
  "utf8",
);
const CALENDAR = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/calendar.tsx"),
  "utf8",
);

describe("useApiQuery — refetchInterval support", () => {
  it("accepts refetchInterval on the options object (number | false)", () => {
    expect(API_LIB).toMatch(/refetchInterval\?:\s*number\s*\|\s*false/);
  });

  it("threads the value into react-query — default false (no polling)", () => {
    expect(API_LIB).toMatch(/let refetchInterval: number \| false = false/);
    expect(API_LIB).toMatch(/refetchInterval = options\.refetchInterval \?\? false/);
    // Passed through to useQuery
    expect(API_LIB).toMatch(/refetchInterval,/);
  });
});

describe("UmrahCalendar — Phase 3 auto-refresh toggle", () => {
  it("autoRefresh state is opt-in (default false)", () => {
    expect(CALENDAR).toMatch(/const \[autoRefresh, setAutoRefresh\] = useState\(false\)/);
  });

  it("eventsQ feeds refetchInterval from the toggle (60_000ms when ON, false when OFF)", () => {
    expect(CALENDAR).toMatch(/refetchInterval: autoRefresh \? 60_000 : false/);
  });

  it("renders a clear Arabic toggle button with a testid + state-aware label", () => {
    expect(CALENDAR).toContain('data-testid="calendar-auto-refresh-toggle"');
    expect(CALENDAR).toContain("تحديث تلقائي · 60ث");
    expect(CALENDAR).toContain("تحديث تلقائي");
  });

  it("button spins the refresh icon while a fetch is in flight (visible feedback)", () => {
    expect(CALENDAR).toMatch(/autoRefresh && eventsQ\.isFetching \? "animate-spin" : ""/);
  });

  it("RefreshCw is imported from lucide-react alongside the other calendar icons", () => {
    expect(CALENDAR).toMatch(/import \{[\s\S]{0,200}RefreshCw[\s\S]{0,100}\} from "lucide-react"/);
  });
});
