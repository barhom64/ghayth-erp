import { Button } from "@/components/ui/button";

/**
 * Quick-pick date-range presets — operators almost always frame
 * reports by one of a small set of windows (YTD / last quarter /
 * last 30 days / last 12 months). Typing dates by hand is friction,
 * so this component renders a one-click row that updates the
 * from/to state in the parent page.
 *
 * Drop-in: used on entity-pnl, cost-center-drill-pnl, entity-ranking.
 * The "all-time" reset is mapped to empty strings — matching the
 * convention each consumer page already uses to fall back to the
 * backend's default range (lifetime / last 12 months / etc).
 */

export interface DateRange {
  from: string; // YYYY-MM-DD or "" for "all-time"
  to: string;
}

export interface DateRangePresetsProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /**
   * Optional testid prefix so each consumer page can scope its
   * preset buttons separately for screenshot regression.
   */
  testidPrefix?: string;
  /**
   * Hide the "all-time" reset chip — used on pages where the
   * default range is desirable instead of an empty string.
   */
  hideAllTime?: boolean;
}

function isoToday(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function isoYtdStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-01-01`;
}

function isoLastQuarterStart(): string {
  // "Last quarter" means the PREVIOUS calendar quarter (Q1 = Jan-Mar,
  // Q2 = Apr-Jun, ...). If we're currently in Q1, last quarter is
  // Q4 of the previous year — handled by underflow.
  const d = new Date();
  const currentQ = Math.floor(d.getUTCMonth() / 3); // 0,1,2,3
  const lastQ = currentQ === 0 ? 3 : currentQ - 1;
  const year = currentQ === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const startMonth = lastQ * 3 + 1; // 1,4,7,10
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

function isoLastQuarterEnd(): string {
  // Last day of the previous calendar quarter — derived by subtracting
  // 1 day from the start of the current quarter.
  const d = new Date();
  const currentQ = Math.floor(d.getUTCMonth() / 3);
  const startMonth = currentQ * 3; // 0,3,6,9
  const start = new Date(Date.UTC(d.getUTCFullYear(), startMonth, 1));
  start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString().slice(0, 10);
}

interface Preset {
  label: string;
  testid: string;
  compute: () => DateRange;
}

const PRESETS: Preset[] = [
  {
    label: "آخر 30 يوماً",
    testid: "30d",
    compute: () => ({ from: isoDaysAgo(30), to: isoToday() }),
  },
  {
    label: "هذا الربع",
    testid: "qtd",
    compute: () => {
      // Current quarter start → today. Mirrors isoLastQuarterEnd
      // logic but takes the CURRENT quarter's start month.
      const d = new Date();
      const startMonth = Math.floor(d.getUTCMonth() / 3) * 3;
      const from = `${d.getUTCFullYear()}-${String(startMonth + 1).padStart(2, "0")}-01`;
      return { from, to: isoToday() };
    },
  },
  {
    label: "الربع السابق",
    testid: "last-qtr",
    compute: () => ({ from: isoLastQuarterStart(), to: isoLastQuarterEnd() }),
  },
  {
    label: "من بداية السنة",
    testid: "ytd",
    compute: () => ({ from: isoYtdStart(), to: isoToday() }),
  },
  {
    label: "آخر 12 شهراً",
    testid: "12m",
    compute: () => ({ from: isoMonthsAgo(12), to: isoToday() }),
  },
];

export function DateRangePresets({
  value,
  onChange,
  testidPrefix = "date-presets",
  hideAllTime = false,
}: DateRangePresetsProps) {
  // An active preset matches when the current from/to equal what the
  // preset would produce. Used to highlight the chip the operator
  // last clicked (or to leave nothing active when they typed dates
  // manually).
  const activeKey = PRESETS.find((p) => {
    const r = p.compute();
    return r.from === value.from && r.to === value.to;
  })?.testid;

  return (
    <div className="flex flex-wrap gap-1" data-testid={`${testidPrefix}-row`}>
      {PRESETS.map((p) => (
        <Button
          key={p.testid}
          size="sm"
          variant={activeKey === p.testid ? "default" : "outline"}
          onClick={() => onChange(p.compute())}
          data-testid={`${testidPrefix}-${p.testid}`}
          className="text-xs h-7"
        >
          {p.label}
        </Button>
      ))}
      {!hideAllTime && (
        <Button
          size="sm"
          variant={!value.from && !value.to ? "default" : "ghost"}
          onClick={() => onChange({ from: "", to: "" })}
          data-testid={`${testidPrefix}-all-time`}
          className="text-xs h-7"
        >
          كامل العمر
        </Button>
      )}
    </div>
  );
}
