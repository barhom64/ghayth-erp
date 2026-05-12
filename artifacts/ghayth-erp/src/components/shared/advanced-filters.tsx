import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnifiedDateRange } from "@/components/ui/unified-date-range";
import { Badge } from "@/components/ui/badge";
import { Filter, X, Search, Download, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterConfig {
  statuses?: { value: string; label: string }[];
  branches?: { value: string; label: string }[];
  showDateRange?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  extraFilters?: { key: string; label: string; options: { value: string; label: string }[] }[];
}

export interface FilterValues {
  search: string;
  status: string;
  branch: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

interface AdvancedFiltersProps {
  config?: FilterConfig;
  values?: FilterValues;
  onChange?: (values: FilterValues) => void;
  onExportCSV?: () => void;
  resultCount?: number;
  className?: string;
  statusOptions?: FilterOption[];
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  branchOptions?: FilterOption[];
  branchValue?: string;
  onBranchChange?: (value: string) => void;
  onReset?: () => void;
}

const EMPTY: FilterValues = { search: "", status: "", branch: "", dateFrom: "", dateTo: "" };

export function useFilters(initial?: Partial<FilterValues>): [FilterValues, (v: FilterValues) => void] {
  const merged: FilterValues = { ...EMPTY };
  if (initial) {
    for (const [k, v] of Object.entries(initial)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  const [values, setValues] = useState<FilterValues>(merged);
  return [values, setValues];
}

export function applyFilters<T>(items: T[], values: FilterValues, fields: {
  searchFields?: (keyof T | string)[];
  statusField?: keyof T | string;
  branchField?: keyof T | string;
  dateField?: keyof T | string;
  extraFields?: Record<string, keyof T | string>;
}): T[] {
  let result = items;
  const get = (item: T, f: keyof T | string) => (item as any)[f];

  if (values.search && fields.searchFields?.length) {
    const q = values.search.toLowerCase();
    result = result.filter(item =>
      fields.searchFields!.some(f => String(get(item, f) ?? "").toLowerCase().includes(q))
    );
  }

  if (values.status && fields.statusField) {
    result = result.filter(item => String(get(item, fields.statusField!)) === values.status);
  }

  if (values.branch && fields.branchField) {
    result = result.filter(item => String(get(item, fields.branchField!)) === values.branch);
  }

  if (values.dateFrom && fields.dateField) {
    result = result.filter(item => String(get(item, fields.dateField!)) >= values.dateFrom);
  }
  if (values.dateTo && fields.dateField) {
    result = result.filter(item => String(get(item, fields.dateField!)) <= values.dateTo);
  }

  if (fields.extraFields) {
    for (const [key, field] of Object.entries(fields.extraFields)) {
      if (values[key]) {
        result = result.filter(item => String(get(item, field)) === values[key]);
      }
    }
  }

  return result;
}

export function AdvancedFilters(props: AdvancedFiltersProps) {
  if (props.config && props.values && props.onChange) {
    return <ConfigBasedFilters {...props as any} />;
  }
  return <SimpleFilters {...props} />;
}

function ConfigBasedFilters({ config, values, onChange, onExportCSV, resultCount, className }: {
  config: FilterConfig;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onExportCSV?: () => void;
  resultCount?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Task #170 — pause typing while a 429 cooldown is active so we don't
  // fire a fresh request on every keystroke and keep getting throttled.
  const cooldown = useRateLimitCooldown();
  const activeCount = [values.status, values.branch, values.dateFrom, values.dateTo]
    .filter(Boolean).length +
    (config.extraFilters?.filter(f => values[f.key]) || []).length;

  const update = (key: string, val: string) => {
    onChange({ ...values, [key]: val });
  };

  const clearAll = () => {
    const cleared = { ...EMPTY };
    config.extraFilters?.forEach(f => { cleared[f.key] = ""; });
    onChange(cleared);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {(config.showSearch !== false) && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={cooldown.isCoolingDown ? cooldown.label : (config.searchPlaceholder || "بحث...")}
              value={values.search}
              onChange={e => {
                if (cooldown.isCoolingDown) return;
                update("search", e.target.value);
              }}
              disabled={cooldown.isCoolingDown}
              aria-disabled={cooldown.isCoolingDown}
              title={cooldown.isCoolingDown ? cooldown.label : undefined}
              className="ps-9"
            />
            {cooldown.isCoolingDown && (
              <div
                role="status"
                aria-live="polite"
                className="mt-1 text-[11px] text-amber-600"
              >
                {cooldown.label}
              </div>
            )}
          </div>
        )}

        {config.statuses && (
          <Select value={values.status} onValueChange={v => update("status", v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">كل الحالات</SelectItem>
              {config.statuses.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className={cn("gap-1", activeCount > 0 && "border-primary text-primary")}
        >
          <Filter className="h-3.5 w-3.5" />
          فلترة
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 h-4">{activeCount}</Badge>
          )}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-gray-500">
            <X className="h-3.5 w-3.5" />مسح الفلاتر
          </Button>
        )}

        {onExportCSV && (
          <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-1 ms-auto">
            <Download className="h-3.5 w-3.5" />تصدير جدولي
          </Button>
        )}
      </div>

      {expanded && (
        <div className="flex items-center gap-3 flex-wrap p-3 bg-gray-50 rounded-lg border">
          {config.branches && config.branches.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">الفرع:</span>
              <Select value={values.branch} onValueChange={v => update("branch", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">الكل</SelectItem>
                  {config.branches.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {config.showDateRange !== false && (
            <div className="w-full md:w-auto md:min-w-[420px]">
              <UnifiedDateRange
                value={{ from: values.dateFrom, to: values.dateTo }}
                onChange={(v) => onChange({ ...values, dateFrom: v.from, dateTo: v.to })}
                showPresets
                showDualCalendar={false}
                variant="compact"
              />
            </div>
          )}

          {config.extraFilters?.map(ef => (
            <div key={ef.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">{ef.label}:</span>
              <Select value={values[ef.key] || ""} onValueChange={v => update(ef.key, v === "_all" ? "" : v)}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">الكل</SelectItem>
                  {ef.options.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {resultCount !== undefined && (
        <p className="text-xs text-gray-400">{resultCount} نتيجة</p>
      )}
    </div>
  );
}

function SimpleFilters({
  statusOptions,
  statusValue = "all",
  onStatusChange,
  statusLabel = "الحالة",
  dateFrom = "",
  dateTo = "",
  onDateFromChange,
  onDateToChange,
  branchOptions,
  branchValue = "all",
  onBranchChange,
  onReset,
  className,
}: AdvancedFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters = (statusValue && statusValue !== "all") ||
    dateFrom || dateTo ||
    (branchValue && branchValue !== "all");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className={cn("gap-1.5", hasActiveFilters && "border-primary text-primary")}
        >
          <Filter className="h-3.5 w-3.5" />
          فلاتر متقدمة
          {hasActiveFilters && (
            <span className="bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {[statusValue !== "all" ? 1 : 0, dateFrom ? 1 : 0, dateTo ? 1 : 0, branchValue !== "all" ? 1 : 0].reduce((a, b) => a + b, 0)}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1 text-gray-500 h-7 px-2">
            <X className="h-3 w-3" />
            مسح الفلاتر
          </Button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50/80 rounded-lg border">
          {statusOptions && onStatusChange && (
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-gray-500 mb-1 block">{statusLabel}</label>
              <Select value={statusValue} onValueChange={onStatusChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {statusOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(onDateFromChange || onDateToChange) && (
            <div className="min-w-[280px] flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">الفترة</label>
              <UnifiedDateRange
                value={{ from: dateFrom || "", to: dateTo || "" }}
                onChange={(v) => {
                  if (v.from !== (dateFrom || "")) onDateFromChange?.(v.from);
                  if (v.to !== (dateTo || "")) onDateToChange?.(v.to);
                }}
                showPresets={false}
                showDualCalendar={false}
                variant="compact"
              />
            </div>
          )}

          {branchOptions && onBranchChange && (
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-gray-500 mb-1 block">الفرع</label>
              <Select value={branchValue} onValueChange={onBranchChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفروع</SelectItem>
                  {branchOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function exportToCSV(data: Record<string, any>[], columns: { key: string; label: string }[], filename: string) {
  if (data.length === 0) return;

  const BOM = "\uFEFF";
  const header = columns.map(c => c.label).join(",");
  const rows = data.map(row =>
    columns.map(c => {
      const val = String(row[c.key] ?? "").replace(/"/g, '""');
      return `"${val}"`;
    }).join(",")
  );

  const csv = BOM + header + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useAdvancedFilters() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  const reset = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setBranchFilter("all");
  };

  const applyFilters = <T extends Record<string, any>>(
    data: T[],
    opts: {
      statusField?: string;
      dateField?: string;
      branchField?: string;
    } = {}
  ): T[] => {
    const { statusField = "status", dateField = "createdAt", branchField = "branchId" } = opts;
    let result = data;

    if (statusFilter !== "all") {
      result = result.filter(item => item[statusField] === statusFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(item => {
        const d = item[dateField] ? new Date(item[dateField]) : null;
        return d && d >= from;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(item => {
        const d = item[dateField] ? new Date(item[dateField]) : null;
        return d && d <= to;
      });
    }

    if (branchFilter !== "all") {
      result = result.filter(item => String(item[branchField]) === branchFilter);
    }

    return result;
  };

  return {
    statusFilter, setStatusFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    branchFilter, setBranchFilter,
    reset,
    applyFilters,
  };
}
