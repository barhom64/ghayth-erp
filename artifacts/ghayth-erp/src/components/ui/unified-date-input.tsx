// ============================================================================
// unified-date-input.tsx
// مكوّن إدخال تاريخ موحّد لكامل النظام.
//
// يدعم:
// - كتابة يدوية (DMY ميلادي، DMY هجري، ISO، أرقام عربية)
// - اختيار من تقويم منبثق (هجري/ميلادي مع تبديل)
// - عرض ثنائي تحت الحقل (الموافق هجري/ميلادي)
// - وقت اختياري
// - تحقق منطقي (required, minDate, maxDate, noFuture, noPast)
// - اختصارات سريعة (اليوم، أمس، إلخ)
// - 4 variants: default, compact, outlined, inline
//
// التخزين الداخلي دائماً ISO (YYYY-MM-DD أو YYYY-MM-DDTHH:mm).
// ============================================================================

import * as React from "react";
import { CalendarIcon, RefreshCw, AlertCircle } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type CalendarType,
  parseFlexibleDate,
  formatGregorian,
  formatHijri,
  formatDual,
  toISODate,
  toISODateTime,
  fromISO,
  validateDate,
  gregorianToHijri,
  hijriToGregorian,
  DATE_PRESETS,
  type DateValidationOptions,
} from "@/lib/date-utils";

// ============================================================================
// تقويم هجري بسيط (نسخة مستقلة لتجنّب الاعتماد على date-picker القديم)
// ============================================================================

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الثاني",
  "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

const WEEKDAYS_AR_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

function getDaysInHijriMonth(hYear: number, hMonth: number): number {
  const firstDay = hijriToGregorian(hYear, hMonth, 1);
  const nextMonthFirst = hMonth === 12
    ? hijriToGregorian(hYear + 1, 1, 1)
    : hijriToGregorian(hYear, hMonth + 1, 1);
  return Math.round((nextMonthFirst.getTime() - firstDay.getTime()) / (24 * 3600 * 1000));
}

function HijriCalendar({
  selected,
  onSelect,
  maxDate,
  minDate,
}: {
  selected?: Date;
  onSelect: (d: Date) => void;
  maxDate?: Date;
  minDate?: Date;
}) {
  const today = new Date();
  const todayH = gregorianToHijri(today);
  const initH = selected ? gregorianToHijri(selected) : todayH;

  const [viewYear, setViewYear] = React.useState(initH.year);
  const [viewMonth, setViewMonth] = React.useState(initH.month);

  const daysInMonth = getDaysInHijriMonth(viewYear, viewMonth);
  const firstDayOfWeek = hijriToGregorian(viewYear, viewMonth, 1).getDay();

  const selectedH = selected ? gregorianToHijri(selected) : null;

  const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="p-3 select-none" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="p-1 rounded hover:bg-muted"
          onClick={() => {
            if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
            else setViewMonth((m) => m + 1);
          }}
        >
          <span className="text-lg">›</span>
        </button>
        <div className="text-sm font-medium">
          {HIJRI_MONTHS[viewMonth - 1]} {viewYear}هـ
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-muted"
          onClick={() => {
            if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
            else setViewMonth((m) => m - 1);
          }}
        >
          <span className="text-lg">‹</span>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0 mb-1">
        {WEEKDAYS_AR_SHORT.map((d) => (
          <div key={d} className="text-center text-[0.7rem] text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const greg = hijriToGregorian(viewYear, viewMonth, day);
          const isDisabled = (maxDate && greg > maxDate) || (minDate && greg < minDate);
          const isSelected = selectedH && selectedH.year === viewYear && selectedH.month === viewMonth && selectedH.day === day;
          const isToday = todayH.year === viewYear && todayH.month === viewMonth && todayH.day === day;
          return (
            <button
              key={i}
              type="button"
              disabled={!!isDisabled}
              onClick={() => onSelect(greg)}
              className={cn(
                "h-8 w-full text-sm rounded-md transition-colors",
                isDisabled
                  ? "text-muted-foreground opacity-40 cursor-not-allowed"
                  : isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// المكوّن الرئيسي
// ============================================================================

export type DateInputMode = "date" | "datetime";
export type DateInputVariant = "default" | "compact" | "outlined" | "inline";

export interface UnifiedDateInputProps extends DateValidationOptions {
  /** القيمة بصيغة ISO (YYYY-MM-DD أو YYYY-MM-DDTHH:mm) */
  value?: string;
  onChange?: (iso: string) => void;
  /** "date" = تاريخ فقط، "datetime" = تاريخ + وقت */
  mode?: DateInputMode;
  /** التقويم الافتراضي للعرض في المنبثقة */
  defaultCalendar?: CalendarType;
  /** يعرض الموافق هجري/ميلادي تحت الحقل */
  showDualCalendar?: boolean;
  /** يعرض اختصارات سريعة (اليوم، أمس) */
  showPresets?: boolean;
  /** يسمح بالكتابة اليدوية (افتراضي true) */
  allowManualInput?: boolean;
  /** يستخدم تنسيق 12 ساعة للوقت */
  hour12?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
  variant?: DateInputVariant;
  /** نص الخطأ من الخارج (يتجاوز التحقق الداخلي) */
  externalError?: string;
}

export function UnifiedDateInput({
  value,
  onChange,
  mode = "date",
  defaultCalendar = "gregory",
  showDualCalendar = true,
  showPresets = true,
  allowManualInput = true,
  hour12 = false,
  placeholder,
  className,
  inputClassName,
  disabled,
  id,
  variant = "default",
  externalError,
  required,
  minDate,
  maxDate,
  noFuture,
  noPast,
}: UnifiedDateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [calendar, setCalendar] = React.useState<CalendarType>(defaultCalendar);
  const [textValue, setTextValue] = React.useState(""); // للكتابة اليدوية
  const [touched, setTouched] = React.useState(false);

  // التاريخ المختار من القيمة الحالية
  const selectedDate = React.useMemo(() => {
    if (!value) return null;
    return fromISO(value.split("T")[0]);
  }, [value]);

  const selectedTime = React.useMemo(() => {
    if (!value) return "";
    const t = value.split("T")[1];
    return t ? t.slice(0, 5) : "";
  }, [value]);

  // عند تغيير القيمة من الخارج، حدّث النص
  React.useEffect(() => {
    if (selectedDate) {
      setTextValue(
        calendar === "hijri"
          ? formatHijri(selectedDate)
          : formatGregorian(selectedDate),
      );
    } else {
      setTextValue("");
    }
  }, [selectedDate, calendar]);

  // محوّل التاريخ → ISO مع/بدون وقت
  const emit = React.useCallback(
    (date: Date | null, time?: string) => {
      if (!date) {
        onChange?.("");
        return;
      }
      if (mode === "datetime") {
        const t = time || selectedTime || "00:00";
        const [h, m] = t.split(":").map((x) => parseInt(x, 10));
        date.setHours(h || 0, m || 0, 0, 0);
        onChange?.(toISODateTime(date));
      } else {
        onChange?.(toISODate(date));
      }
    },
    [mode, onChange, selectedTime],
  );

  // اختيار من التقويم
  const handleCalendarSelect = (d: Date) => {
    emit(d, selectedTime);
    setOpen(false);
    setTouched(true);
  };

  // الكتابة اليدوية: حلّل عند فقدان التركيز أو Enter
  const handleManualBlur = () => {
    if (!textValue.trim()) {
      onChange?.("");
      setTouched(true);
      return;
    }
    const parsed = parseFlexibleDate(textValue, calendar);
    if (parsed) {
      const d = fromISO(parsed.iso);
      if (d) emit(d, parsed.time || selectedTime);
      // لو المستخدم كتب هجري والوضع ميلادي، بدّل العرض
      if (parsed.detectedCalendar !== calendar) {
        setCalendar(parsed.detectedCalendar);
      }
    }
    setTouched(true);
  };

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleManualBlur();
    }
  };

  // الوقت
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    if (selectedDate) {
      emit(selectedDate, t);
    }
  };

  // التحقق
  const validation = React.useMemo(() => {
    if (externalError) return { valid: false, error: externalError };
    if (!touched && !required) return { valid: true };
    return validateDate(value, { required, minDate, maxDate, noFuture, noPast });
  }, [value, externalError, touched, required, minDate, maxDate, noFuture, noPast]);

  // العرض المزدوج
  const dualText = React.useMemo(() => {
    if (!selectedDate || !showDualCalendar) return "";
    if (calendar === "hijri") {
      return `الميلادي: ${formatGregorian(selectedDate)}`;
    }
    return `الهجري: ${formatHijri(selectedDate)}`;
  }, [selectedDate, calendar, showDualCalendar]);

  const minDateObj = React.useMemo(
    () => (minDate instanceof Date ? minDate : minDate ? fromISO(minDate) ?? undefined : undefined),
    [minDate],
  );
  const maxDateObj = React.useMemo(() => {
    const explicit = maxDate instanceof Date ? maxDate : maxDate ? fromISO(maxDate) ?? undefined : undefined;
    if (noFuture) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (!explicit || today < explicit) return today;
    }
    return explicit;
  }, [maxDate, noFuture]);

  // ─── الواجهة ─────────────────────────────────────────────────────────────
  const placeholderText =
    placeholder ||
    (calendar === "hijri" ? "مثال: 17/10/1447" : "مثال: 17/04/2026");

  const isCompact = variant === "compact";
  const isInline = variant === "inline";
  const isOutlined = variant === "outlined";

  return (
    <div className={cn("space-y-1", className)}>
      <div className={cn("flex items-stretch gap-1", isInline && "flex-wrap")}>
        {/* حقل الكتابة اليدوية */}
        <div className="relative flex-1 min-w-0">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={textValue}
            placeholder={placeholderText}
            disabled={disabled || !allowManualInput}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={handleManualBlur}
            onKeyDown={handleManualKeyDown}
            className={cn(
              "pe-9 text-end",
              isCompact && "h-8 text-xs",
              isOutlined && "border-2",
              !validation.valid && "border-destructive focus-visible:ring-destructive",
              inputClassName,
            )}
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "absolute end-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
                aria-label="فتح التقويم"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" dir="rtl">
              <div className="border-b px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {calendar === "hijri" ? "التقويم الهجري" : "التقويم الميلادي"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  type="button"
                  onClick={() => setCalendar((c) => (c === "hijri" ? "gregory" : "hijri"))}
                >
                  <RefreshCw className="h-3 w-3" />
                  {calendar === "hijri" ? "ميلادي" : "هجري"}
                </Button>
              </div>

              {showPresets && (
                <div className="border-b px-2 py-2 flex flex-wrap gap-1">
                  {DATE_PRESETS.map((p) => (
                    <Button
                      key={p.key}
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const d = p.getDate();
                        if (d instanceof Date) handleCalendarSelect(d);
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              )}

              {calendar === "hijri" ? (
                <HijriCalendar
                  selected={selectedDate ?? undefined}
                  onSelect={handleCalendarSelect}
                  minDate={minDateObj}
                  maxDate={maxDateObj}
                />
              ) : (
                <DayPicker
                  mode="single"
                  selected={selectedDate ?? undefined}
                  onSelect={(d) => d && handleCalendarSelect(d)}
                  disabled={(date) => {
                    if (maxDateObj && date > maxDateObj) return true;
                    if (minDateObj && date < minDateObj) return true;
                    return false;
                  }}
                  dir="rtl"
                  className="p-3"
                  classNames={{
                    day_selected: "bg-primary text-primary-foreground rounded-md",
                    day_today: "bg-accent text-accent-foreground rounded-md",
                    day: "h-8 w-8 text-center text-sm rounded-md hover:bg-muted transition-colors",
                    head_cell: "text-muted-foreground text-[0.7rem] font-normal",
                    nav_button: "p-1 hover:bg-muted rounded",
                    caption: "flex justify-center items-center gap-2 pb-2 text-sm font-medium",
                    table: "w-full",
                    head_row: "flex mb-1",
                    row: "flex w-full",
                  }}
                />
              )}

              {selectedDate && (
                <div className="border-t px-3 py-2 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {formatDual(selectedDate)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => { onChange?.(""); setOpen(false); setTouched(true); }}
                  >
                    مسح
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* حقل الوقت */}
        {mode === "datetime" && (
          <Input
            type="time"
            dir="ltr"
            value={selectedTime}
            disabled={disabled || !selectedDate}
            onChange={handleTimeChange}
            className={cn(
              "w-28 shrink-0",
              isCompact && "h-8 text-xs",
              isOutlined && "border-2",
            )}
            step={hour12 ? 60 : undefined}
          />
        )}
      </div>

      {/* العرض الثنائي */}
      {showDualCalendar && dualText && validation.valid && (
        <p className="text-xs text-muted-foreground ps-1">{dualText}</p>
      )}

      {/* رسالة الخطأ */}
      {!validation.valid && validation.error && (
        <p className="text-xs text-destructive flex items-center gap-1 ps-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {validation.error}
        </p>
      )}
    </div>
  );
}
