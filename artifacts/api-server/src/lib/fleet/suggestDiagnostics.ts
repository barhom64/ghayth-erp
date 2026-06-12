/**
 * Assignment suggestion diagnostics — #1812 user gap #5.
 *
 * The engine (`assignmentSuggestionEngine.ts`) returns an empty array
 * when no (vehicle, driver) pair matches the booking. The SPA used to
 * render a generic "no candidates" message — even when the actual
 * cause was structural (no vehicles at all, no active drivers, no
 * scheduled window on the booking).
 *
 * This helper runs cheap explanatory queries when the engine returns
 * 0 results, so the SPA can show the operator WHY the result is
 * empty and what to fix.
 *
 * Called from the suggest-assignment endpoint at:
 *   POST /transport/bookings/:id/suggest-assignment
 *
 * Returns null when the engine returned >0 candidates (no diagnostic
 * needed). Returns a structured payload with the failing axis +
 * Arabic explanation otherwise.
 */

import { rawQuery } from "../rawdb.js";
import {
  checkOperatingWindow,
  type OperatingWindowSettings,
} from "./operatingWindow.js";

export interface SuggestDiagnostics {
  /** Human-readable Arabic explanation the SPA can display verbatim. */
  reason: string;
  /** Coarse axis the operator should look at. */
  axis:
    | "no_vehicles"
    | "no_active_drivers"
    | "no_dispatchable_vehicles"
    | "no_window"
    | "outside_operating_hours"
    | "all_busy"
    | "all_blocked"
    | "unknown";
  /** Raw counts for transparency. */
  counts: {
    totalVehicles: number;
    dispatchableVehicles: number;
    totalDrivers: number;
    activeDrivers: number;
  };
  /** Concrete next steps the operator can take. */
  hints: string[];
}

interface Args {
  companyId: number;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
}

/**
 * Run the diagnostic queries. ALL queries are bounded (count(*) only)
 * and re-use the same indexes the engine uses, so the diagnostic
 * adds 4 cheap SELECTs in the worst case (the failure path).
 */
export async function diagnoseEmptySuggest(args: Args): Promise<SuggestDiagnostics> {
  const [vehiclesRow] = await rawQuery<{ total: string; dispatchable: string }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status IN ('available', 'in_use')) AS dispatchable
       FROM fleet_vehicles
      WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
    [args.companyId],
  );
  const totalVehicles = Number(vehiclesRow?.total ?? 0);
  const dispatchableVehicles = Number(vehiclesRow?.dispatchable ?? 0);

  const [driversRow] = await rawQuery<{ total: string; active: string }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE COALESCE(status, 'active') NOT IN ('inactive', 'terminated')) AS active
       FROM fleet_drivers
      WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
    [args.companyId],
  );
  const totalDrivers = Number(driversRow?.total ?? 0);
  const activeDrivers = Number(driversRow?.active ?? 0);

  const counts = {
    totalVehicles, dispatchableVehicles,
    totalDrivers, activeDrivers,
  };

  if (totalVehicles === 0) {
    return {
      reason: "لا توجد مركبات مسجلة في الأسطول. أضف مركبة واحدة على الأقل قبل الإسناد.",
      axis: "no_vehicles",
      counts,
      hints: [
        "اذهب إلى /fleet/vehicles/create لإضافة مركبة.",
        "تحقق من أن المركبات لم تُحذف بالخطأ (deletedAt IS NULL).",
      ],
    };
  }
  if (dispatchableVehicles === 0) {
    return {
      reason: `يوجد ${totalVehicles} مركبة(ات)، لكن لا واحدة بالحالة 'available' أو 'in_use'.`,
      axis: "no_dispatchable_vehicles",
      counts,
      hints: [
        "تحقق من حالة المركبات: قد تكون كلها في الصيانة، خارج الخدمة، أو موقوفة.",
        "حدّث حالة المركبة من شاشة تفاصيل المركبة → 'تغيير الحالة'.",
      ],
    };
  }
  if (totalDrivers === 0) {
    return {
      reason: "لا يوجد سائقون مسجلون. أضف سائقاً واحداً على الأقل قبل الإسناد.",
      axis: "no_active_drivers",
      counts,
      hints: [
        "اذهب إلى /fleet/drivers/create لإضافة سائق.",
        "تأكد من ربط السائق بالشركة الصحيحة.",
      ],
    };
  }
  if (activeDrivers === 0) {
    return {
      reason: `يوجد ${totalDrivers} سائق(ون)، لكن كلهم بحالة 'inactive' أو 'terminated'.`,
      axis: "no_active_drivers",
      counts,
      hints: [
        "حدّث حالة السائقين من شاشة تفاصيل السائق.",
        "السائقون المنتهية خدمتهم يحتاجون إعادة تفعيل أو حذف.",
      ],
    };
  }
  if (!args.scheduledStartAt || !args.scheduledEndAt) {
    return {
      reason: "الحجز ليس له نافذة زمنية محددة — المحرك يحتاج scheduledStartAt + scheduledEndAt للتحقق من التعارضات.",
      axis: "no_window",
      counts,
      hints: [
        "أدخل تاريخ ووقت الانطلاق والوصول في شاشة الحجز.",
        "أو استخدم نافذة التحميل + نافذة التسليم في قسم 'اتفاق العميل'.",
      ],
    };
  }

  // #2079 PE-04 — operating-window check. When the engine returned
  // empty because the trip starts outside the company's configured
  // transport operating hours, that exact Arabic reason is what the
  // operator must see — not a generic "all busy".
  const [windowRow] = await rawQuery<OperatingWindowSettings>(
    `SELECT "operatingStartTime", "operatingEndTime", "operatingDaysMask"
       FROM transport_planning_settings
      WHERE "companyId" = $1`,
    [args.companyId],
  );
  if (windowRow) {
    const verdict = checkOperatingWindow(args.scheduledStartAt, windowRow);
    if (verdict.blocked) {
      return {
        reason: verdict.reason!,
        axis: "outside_operating_hours",
        counts,
        hints: [
          "عدّل وقت انطلاق الرحلة ليقع داخل ساعات تشغيل النقل.",
          "أو راجع إعدادات ساعات التشغيل في إعدادات تخطيط النقل إذا كانت الرحلة مقصودة.",
        ],
      };
    }
  }

  // المركبات + السائقون موجودون والنافذة محددة — لا بد أن المشكلة
  // في تعارض زمني (busy) أو في فشل قواعد الترشيح (capacity/license/agreement).
  return {
    reason: `يوجد ${dispatchableVehicles} مركبة قابلة للإسناد و ${activeDrivers} سائق فعّال، لكن جميع التركيبات (vehicle, driver) إما مشغولة بحجز آخر في نفس النافذة الزمنية أو فشلت في قواعد المطابقة (السعة، فئة الرخصة، اتفاق العميل، راحة السائق).`,
    axis: "all_busy",
    counts,
    hints: [
      "وسّع النافذة الزمنية للحجز.",
      "راجع اتفاق العميل (سياسة الاستبدال / المركبة المطلوبة).",
      "تحقق من أن سعة المركبات تكفي عدد الركاب أو وزن الحمولة.",
      "تحقق من فئات رخص السائقين مقابل متطلب المركبة.",
    ],
  };
}
