/**
 * Operating Window + Utilization scoring — PE-04 (#2079).
 *
 * Closes UTIL-01 (engine blind to prior utilisation) + UTIL-02
 * (24/7 denominator) from `docs/transport-audit/20` §1, plus the
 * owner's operating-hours mandate (2026-06-11):
 *
 *   «إذا كانت نافذة الرحلة خارج ساعات تشغيل الفرع، فلا تدخل في
 *    الترشيح إلا إذا كان هناك استثناء موثق لاحقًا. يجب أن يظهر
 *    سبب رفض عربي واضح.»
 *
 *   «utilization لا يكون حارسًا مانعًا بذاته... الأصل أن يكون
 *    عامل scoring / balancing حتى لا يمنع التشغيل بلا سبب.»
 *
 * Two distinct mechanisms, deliberately different in strength:
 *
 *   1. Operating window  → HARD guard. A trip that STARTS outside
 *      the configured window (time-of-day + day-of-week mask, both
 *      Asia/Riyadh wall-clock) is refused before any candidate is
 *      considered. NULL configuration = 24/7 = no enforcement.
 *      Only the trip START is gated — long hauls may legitimately
 *      END at night (Riyadh→Jeddah departing 14:00 arriving 23:30).
 *
 *   2. Utilization        → SCORING axis only. Never blocks. Feeds
 *      a 0..100 sub-score into the weighted sum so the engine
 *      spreads load across the fleet instead of hammering the same
 *      vehicle. The denominator honours the operating window when
 *      configured (UTIL-02 fix), falling back to 12h/day.
 */

export interface OperatingWindowSettings {
  /** 'HH:MM' or 'HH:MM:SS' as returned by pg for TIME columns. Null = unbounded. */
  operatingStartTime: string | null;
  operatingEndTime: string | null;
  /** 7-bit mask, bit 0 = Sunday (Asia/Riyadh) — same convention as
   *  transport_route_patterns.daysOfWeekMask. Null = all days. */
  operatingDaysMask: number | null;
}

export interface WindowVerdict {
  blocked: boolean;
  /** Arabic, ready for diagnostics / blockers strings. Null when allowed. */
  reason: string | null;
}

const RIYADH_TZ = "Asia/Riyadh";

/** Day-of-week (0 = Sunday) of an instant, in Riyadh wall-clock. */
export function riyadhDayOfWeek(iso: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: RIYADH_TZ,
    weekday: "short",
  }).format(new Date(iso));
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  return idx >= 0 ? idx : new Date(iso).getUTCDay();
}

/** Minutes since midnight of an instant, in Riyadh wall-clock. */
export function riyadhMinutesOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = parts.split(":").map(Number);
  return (h === 24 ? 0 : h) * 60 + m;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

const DAY_NAMES_AR = [
  "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
];

/**
 * HARD guard: does the trip START fall inside the operating window?
 *
 *   • Both time bounds null → no time gate.
 *   • Days mask null        → no day gate.
 *   • Overnight windows (start > end, e.g. 20:00→04:00) are honoured:
 *     "inside" means after start OR before end.
 *
 * Only the START instant is checked — see module docblock.
 */
export function checkOperatingWindow(
  tripStartIso: string,
  settings: OperatingWindowSettings | null,
): WindowVerdict {
  if (!settings) return { blocked: false, reason: null };

  const { operatingStartTime, operatingEndTime, operatingDaysMask } = settings;

  if (operatingDaysMask != null) {
    const dow = riyadhDayOfWeek(tripStartIso);
    if (((operatingDaysMask >> dow) & 1) === 0) {
      return {
        blocked: true,
        reason: `انطلاق الرحلة يوم ${DAY_NAMES_AR[dow]} خارج أيام تشغيل النقل المعتمدة`,
      };
    }
  }

  if (operatingStartTime != null && operatingEndTime != null) {
    const startMin = parseTimeToMinutes(operatingStartTime);
    const endMin = parseTimeToMinutes(operatingEndTime);
    const tripMin = riyadhMinutesOfDay(tripStartIso);

    const inside = startMin < endMin
      ? tripMin >= startMin && tripMin < endMin            // normal window
      : tripMin >= startMin || tripMin < endMin;           // overnight window

    if (!inside) {
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return {
        blocked: true,
        reason:
          `انطلاق الرحلة (${fmt(tripMin)} بتوقيت الرياض) خارج ساعات تشغيل النقل` +
          ` (${fmt(startMin)}–${fmt(endMin)})`,
      };
    }
  }

  return { blocked: false, reason: null };
}

/**
 * Daily operating minutes for the utilisation denominator.
 * Configured window → its length (overnight windows wrap correctly).
 * No window → 12h (720min): the audit's documented fallback — a
 * commercial fleet does not operate 24/7, and 24h denominators
 * understate utilisation by half (UTIL-02).
 */
export function dailyOperatingMinutes(settings: OperatingWindowSettings | null): number {
  if (!settings || settings.operatingStartTime == null || settings.operatingEndTime == null) {
    return 720;
  }
  const start = parseTimeToMinutes(settings.operatingStartTime);
  const end = parseTimeToMinutes(settings.operatingEndTime);
  return end > start ? end - start : 24 * 60 - start + end;
}

/**
 * SCORING axis (never blocks): 0..100 from the vehicle's trailing
 * 7-day utilisation percentage. The curve favours the mid band:
 *
 *   30–60%  → 100   (healthy rotation)
 *   10–30%  →  70   (under-used — fine, slight preference for mid)
 *   60–80%  →  70   (busy — still OK)
 *   <10%    →  55   (possibly idle for a reason — surface but don't bury)
 *   >80%    →  40   (over-worked — spread the load elsewhere)
 *
 * Documented in docs/transport-audit/20 §1 (UTIL-01 fix). The axis
 * weight in the engine is 0.05 so even a 40 here moves the final
 * score by ≤3 points — balancing, not blocking, per the owner's
 * explicit instruction.
 */
export function utilizationScore(utilisationPct: number): number {
  if (utilisationPct >= 30 && utilisationPct <= 60) return 100;
  if (utilisationPct > 80) return 40;
  if (utilisationPct < 10) return 55;
  return 70;
}
