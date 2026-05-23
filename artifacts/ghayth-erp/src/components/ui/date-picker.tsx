// ============================================================================
// date-picker.tsx
// ⚠️ DEPRECATED: استخدم UnifiedDateInput من "@/components/ui/unified-date-input"
// مباشرة. هذا الملف يحتفظ بنفس الـ API كـ wrapper للحفاظ على التوافقية الخلفية.
//
// التحويل:
//   <DatePicker value={x} onChange={fn} />
//   ⇒ <UnifiedDateInput value={x} onChange={fn} />
// ============================================================================

import { UnifiedDateInput } from "./unified-date-input";
import { useAuth } from "@/lib/auth";

export interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** "hijri" | "gregorian" | "both" — يُترجم إلى defaultCalendar */
  calendarMode?: "hijri" | "gregorian" | "both";
  maxDate?: Date;
  minDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  id,
  calendarMode,
  maxDate,
  minDate,
}: DatePickerProps) {
  // قراءة تفضيل المستخدم: الأولوية للـprop المُمرَّر، ثم تفضيل
  // الحساب من /auth/me (يُحدَّث في server بـPATCH /auth/me/preferences
  // ويَتبع المستخدم عبر الأجهزة)، ثم localStorage كـlegacy fallback.
  const auth = useAuth();
  const resolveDefault = (): "hijri" | "gregory" => {
    if (calendarMode === "hijri") return "hijri";
    if (calendarMode === "gregorian" || calendarMode === "both") return "gregory";
    if (auth.user?.preferredCalendar === "hijri") return "hijri";
    if (auth.user?.preferredCalendar === "gregorian") return "gregory";
    try {
      const stored = localStorage.getItem("calendarMode");
      if (stored === "hijri") return "hijri";
    } catch { /* ignore */ }
    return "gregory";
  };

  return (
    <UnifiedDateInput
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      defaultCalendar={resolveDefault()}
      maxDate={maxDate}
      minDate={minDate}
      mode="date"
      showDualCalendar
    />
  );
}
