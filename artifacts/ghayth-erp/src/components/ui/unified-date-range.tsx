// ============================================================================
// unified-date-range.tsx
// مكوّن فترة تاريخ موحّد (من — إلى) مبني فوق UnifiedDateInput.
//
// يدعم:
// - حقلين منفصلين بنفس قواعد UnifiedDateInput
// - تحقق منطقي: "إلى" لا يكون قبل "من"
// - اختصارات سريعة للفترات (هذا الأسبوع، هذا الشهر، آخر 30 يوماً، إلخ)
// - 3 layouts: horizontal (افتراضي)، vertical، compact
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  UnifiedDateInput,
  type UnifiedDateInputProps,
  type DateInputMode,
  type DateInputVariant,
} from "./unified-date-input";
import {
  type CalendarType,
  validateRange,
  toISODate,
  RANGE_PRESETS,
} from "@/lib/date-utils";

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface UnifiedDateRangeProps {
  value?: DateRangeValue;
  onChange?: (value: DateRangeValue) => void;
  mode?: DateInputMode;
  defaultCalendar?: CalendarType;
  showDualCalendar?: boolean;
  showPresets?: boolean;
  /** layout="horizontal" يضع الحقلين جنب بعض، vertical يضعهما تحت بعض. */
  layout?: "horizontal" | "vertical";
  variant?: DateInputVariant;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  noFuture?: boolean;
  noPast?: boolean;
  /** حد أقصى لمدى الفترة بالأيام */
  maxRangeDays?: number;
}

export function UnifiedDateRange({
  value = { from: "", to: "" },
  onChange,
  mode = "date",
  defaultCalendar = "gregory",
  showDualCalendar = false,
  showPresets = true,
  layout = "horizontal",
  variant = "default",
  fromLabel = "من",
  toLabel = "إلى",
  className,
  disabled,
  required,
  noFuture,
  noPast,
  maxRangeDays,
}: UnifiedDateRangeProps) {
  const setFrom = (from: string) => onChange?.({ from, to: value.to });
  const setTo = (to: string) => onChange?.({ from: value.from, to });

  const validation = React.useMemo(() => {
    const r = validateRange(value.from, value.to, { required, noFuture, noPast });
    if (r.valid && maxRangeDays && value.from && value.to) {
      const f = new Date(value.from);
      const t = new Date(value.to);
      const days = Math.floor((t.getTime() - f.getTime()) / (24 * 3600 * 1000)) + 1;
      if (days > maxRangeDays) {
        return { valid: false, error: `المدة أكبر من الحد المسموح (${maxRangeDays} يوماً)` };
      }
    }
    return r;
  }, [value, required, noFuture, noPast, maxRangeDays]);

  const sharedProps: Partial<UnifiedDateInputProps> = {
    mode,
    defaultCalendar,
    showDualCalendar,
    variant,
    disabled,
    noFuture,
    noPast,
  };

  return (
    <div className={cn("space-y-2", className)}>
      {showPresets && (
        <div className="flex flex-wrap gap-1">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={disabled}
              onClick={() => {
                const r = p.getDate();
                if (Array.isArray(r)) {
                  onChange?.({ from: toISODate(r[0]), to: toISODate(r[1]) });
                }
              }}
            >
              {p.label}
            </Button>
          ))}
          {(value.from || value.to) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              disabled={disabled}
              onClick={() => onChange?.({ from: "", to: "" })}
            >
              مسح الفترة
            </Button>
          )}
        </div>
      )}

      <div
        className={cn(
          layout === "horizontal" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3",
        )}
      >
        <div>
          {fromLabel && <Label className="text-xs mb-1 block">{fromLabel}</Label>}
          <UnifiedDateInput
            {...sharedProps}
            value={value.from}
            onChange={setFrom}
            required={required}
            maxDate={value.to || undefined}
          />
        </div>
        <div>
          {toLabel && <Label className="text-xs mb-1 block">{toLabel}</Label>}
          <UnifiedDateInput
            {...sharedProps}
            value={value.to}
            onChange={setTo}
            required={required}
            minDate={value.from || undefined}
          />
        </div>
      </div>

      {!validation.valid && validation.error && (
        <p className="text-xs text-destructive ps-1">{validation.error}</p>
      )}
    </div>
  );
}
