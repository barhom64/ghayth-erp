import * as React from "react";
import { format, parseISO, isValid } from "date-fns";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toHijri(date: Date): { year: number; month: number; day: number; monthName: string } {
  try {
    const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const year = parseInt(get("year").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
    const month = parseInt(get("month").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
    const day = parseInt(get("day").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));

    const fmtLong = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long" });
    const monthName = fmtLong.format(date);
    return { year, month, day, monthName };
  } catch {
    return { year: 0, month: 0, day: 0, monthName: "" };
  }
}

function formatHijri(date: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function formatGregorianShort(date: Date): string {
  return format(date, "dd/MM/yyyy");
}

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الثاني",
  "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

const WEEKDAYS_AR_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date {
  // Estimate a starting point using the Islamic calendar epoch (July 16, 622 CE = Julian Day 1948439.5)
  // Average Hijri year = 354.367 days
  const hijriEpochMs = new Date(622, 6, 16).getTime();
  const approxMs = hijriEpochMs + ((hYear - 1) * 354.367 + (hMonth - 1) * 29.53 + hDay - 1) * MS_PER_DAY;
  const approxGreg = new Date(approxMs);
  for (let offset = -30; offset <= 30; offset++) {
    const candidate = new Date(approxGreg.getTime() + offset * MS_PER_DAY);
    const h = toHijri(candidate);
    if (h.year === hYear && h.month === hMonth && h.day === hDay) {
      return candidate;
    }
  }
  return approxGreg;
}

function getDaysInHijriMonth(hYear: number, hMonth: number): number {
  const firstDay = hijriToGregorian(hYear, hMonth, 1);
  const nextMonth = hMonth === 12
    ? hijriToGregorian(hYear + 1, 1, 1)
    : hijriToGregorian(hYear, hMonth + 1, 1);
  return Math.round((nextMonth.getTime() - firstDay.getTime()) / (24 * 3600 * 1000));
}

function getHijriFirstDayOfWeek(hYear: number, hMonth: number): number {
  const firstDay = hijriToGregorian(hYear, hMonth, 1);
  return firstDay.getDay();
}

interface HijriCalendarProps {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  maxDate?: Date;
  minDate?: Date;
}

function HijriCalendar({ selected, onSelect, maxDate, minDate }: HijriCalendarProps) {
  const today = new Date();
  const todayH = toHijri(today);
  const initH = selected ? toHijri(selected) : todayH;

  const [viewYear, setViewYear] = React.useState(initH.year);
  const [viewMonth, setViewMonth] = React.useState(initH.month);

  const daysInMonth = getDaysInHijriMonth(viewYear, viewMonth);
  const firstDayOfWeek = getHijriFirstDayOfWeek(viewYear, viewMonth);

  const selectedH = selected ? toHijri(selected) : null;

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="p-3 select-none" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="p-1 rounded hover:bg-muted"
          onClick={nextMonth}
        >
          <span className="text-lg">›</span>
        </button>
        <div className="text-sm font-medium">
          {HIJRI_MONTHS[viewMonth - 1]} {viewYear}هـ
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-muted"
          onClick={prevMonth}
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
                  : "hover:bg-muted"
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

export interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  calendarMode?: "hijri" | "gregorian" | "both";
  /** Prevent selecting dates after this date */
  maxDate?: Date;
  /** Prevent selecting dates before this date */
  minDate?: Date;
}

export function DatePicker({ value, onChange, placeholder = "اختر تاريخاً", className, disabled, id, calendarMode: propMode, maxDate, minDate }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const resolveGlobalMode = (): "hijri" | "gregorian" | "both" => {
    try {
      const stored = localStorage.getItem("calendarMode");
      if (stored === "hijri" || stored === "gregorian" || stored === "both") return stored;
    } catch { /* ignore */ }
    return "hijri";
  };

  const getEffectiveMode = (): "hijri" | "gregorian" => {
    const global = propMode ?? resolveGlobalMode();
    if (global === "both") return "hijri";
    return global;
  };

  const [mode, setMode] = React.useState<"hijri" | "gregorian">(getEffectiveMode);

  React.useEffect(() => {
    setMode(getEffectiveMode());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propMode]);

  const selected = value ? (isValid(parseISO(value)) ? parseISO(value) : undefined) : undefined;

  const displayValue = React.useMemo(() => {
    if (!selected) return "";
    const globalMode = propMode ?? resolveGlobalMode();
    if (globalMode === "both") {
      return `${formatHijri(selected)} / ${formatGregorianShort(selected)}`;
    }
    if (mode === "hijri") return formatHijri(selected);
    return formatGregorianShort(selected);
  }, [selected, mode, propMode]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      onChange?.("");
      setOpen(false);
      return;
    }
    const iso = format(date, "yyyy-MM-dd");
    onChange?.(iso);
    setOpen(false);
  };

  const toggleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMode((m) => (m === "hijri" ? "gregorian" : "hijri"));
  };

  const globalMode = propMode ?? resolveGlobalMode();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "w-full justify-start text-right font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="me-2 h-4 w-4 shrink-0" />
          <span className="flex-1">{displayValue || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" dir="rtl">
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {mode === "hijri" ? "التقويم الهجري" : "التقويم الميلادي"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={toggleMode}
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
            {mode === "hijri" ? "ميلادي" : "هجري"}
          </Button>
        </div>

        {mode === "hijri" ? (
          <HijriCalendar selected={selected} onSelect={handleSelect} maxDate={maxDate} minDate={minDate} />
        ) : (
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={(date) => {
              if (maxDate && date > maxDate) return true;
              if (minDate && date < minDate) return true;
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

        {value && (
          <div className="border-t px-3 py-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {selected && globalMode === "both"
                ? ""
                : selected && mode === "gregorian"
                ? formatHijri(selected)
                : selected
                ? formatGregorianShort(selected)
                : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => { onChange?.(""); setOpen(false); }}
              type="button"
            >
              مسح
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
