/**
 * Vehicle Capability Matrix (VCM) — Gate-PE-1 (#2079).
 *
 * The owner's mandate (2026-06-11):
 *   «أريد أن يصبح لكل مركبة Passenger Capacity / Operational
 *    Capacity / Cargo Capacity / Operational Payload / Dimensions /
 *    Axles / Tyres / Fuel Type / Service Type — ثم محرك الإسناد
 *    لا يرشّح أي مركبة إلا بعد المرور على هذه المصفوفة.»
 *
 * Before this module the assignmentSuggestionEngine consulted
 * `payloadKg`, `seatCount`, and `vehicleType` only — leaving the
 * row's `operationalPayloadKg` (safe operating cap, since 295),
 * `validFor{Passengers,Cargo}` (eligibility flags, also 295) and
 * the new `operationalPassengerCapacity` / `vehicleServiceTypes`
 * (315) completely unused. The two scenarios the owner cited:
 *
 *   • «طلب عمرة 45 راكب → قد يقترح النظام مركبة لا تستوعب العدد»
 *     — happened because `seatCount=null` returned a soft 50 score
 *     and the bus surfaced near the top.
 *   • «حمولة 38 طن وحمولة تشغيلية 30 طن»
 *     — happened because the scorer compared 38 ↔ payloadKg=40000
 *     (nominal ceiling), not operationalPayloadKg=30000 (safe cap).
 *
 * VCM closes both. The matrix bundles the row's technical fields
 * into a single typed object + computes a `completeness` score so
 * the engine can hard-eject vehicles whose profile is too sparse
 * to trust ("غير معرّفة كفايةً للترشيح") instead of letting them
 * surface with a misleading "unknown → 50" score.
 *
 * The engine calls `isEligibleForTripFamily` BEFORE the per-pair
 * scoring loop runs; rejected vehicles never enter the loop. This
 * is advisory upstream of `assertCapacity` / `assertDriverEligibility`
 * — those still fire at dispatch commit — but it stops the operator
 * from being shown an unsafe candidate in the first place.
 */

export type TripFamily = "passenger" | "cargo";

export type TransportServiceType =
  | "cargo_load"
  | "passenger_umrah"
  | "passenger_general"
  | "equipment_rental"
  | "internal_transfer"
  | "other";

/**
 * Raw vehicle columns the matrix consumes. Every field is optional
 * because the legacy fleet is sparsely profiled; the matrix decides
 * what "unknown" means per axis (see `completeness`).
 */
export interface VehicleRowForVcm {
  id: number;
  vehicleType: string | null;
  fuelType: string | null;

  // Cargo axis (migration 262 + 295).
  payloadKg: string | number | null;
  operationalPayloadKg: string | number | null;
  boxLengthCm: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  axleCount: number | null;
  tireCount: number | null;
  tireSize: string | null;

  // Passenger axis (migration 262 + 315).
  seatCount: number | null;
  operationalPassengerCapacity: string | number | null;
  hasAc: boolean | null;
  screenCount: number | null;
  doorCount: number | null;
  upholsteryType: string | null;
  safetyFeatures: unknown;

  // Equipment axis (migration 262).
  operatingHours: string | number | null;
  equipmentAttachments: unknown;

  // Eligibility (migration 295 + 315).
  validForPassengers: boolean | null;
  validForCargo: boolean | null;
  vehicleServiceTypes: string[] | null;

  // Powertrain (migration 262).
  engineDisplacementCc: number | null;
  transmissionType: string | null;
}

export interface VcmPassengerCapability {
  eligible: boolean | null;          // null = unknown
  nominalSeats: number | null;
  operationalSeats: number | null;   // capacity used for safety/comfort margin
  hasAc: boolean | null;
}

export interface VcmCargoCapability {
  eligible: boolean | null;
  nominalPayloadKg: number | null;
  operationalPayloadKg: number | null;
  boxLengthCm: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  axleCount: number | null;
  tireCount: number | null;
}

export interface VcmEquipmentCapability {
  eligible: boolean | null;
  operatingHours: number | null;
  attachments: string[] | null;
}

export interface Vcm {
  vehicleId: number;
  family: {
    passengers: VcmPassengerCapability;
    cargo: VcmCargoCapability;
    equipment: VcmEquipmentCapability;
  };
  powertrain: {
    fuelType: string | null;
    engineDisplacementCc: number | null;
    transmissionType: string | null;
  };
  serviceTypes: string[] | null;
  /** 0..100 — proportion of the per-family fields that are populated. */
  completeness: number;
}

/** Minimum completeness the engine accepts before considering a
 *  vehicle for any family. Below this, the row is treated as "not
 *  profiled enough to trust" and dropped. The owner-facing message
 *  surfaces in the engine's reasons string. */
export const VCM_MIN_COMPLETENESS = 70;

/**
 * Build the matrix from a raw row. Numbers are coerced because the
 * underlying DB columns are NUMERIC and pg returns them as strings.
 */
export function computeVcm(row: VehicleRowForVcm): Vcm {
  const num = (v: string | number | null): number | null =>
    v == null ? null : typeof v === "number" ? v : Number(v);

  const nominalSeats = row.seatCount ?? null;
  const opSeats = num(row.operationalPassengerCapacity);
  const nominalPayload = num(row.payloadKg);
  const opPayload = num(row.operationalPayloadKg);

  // Equipment attachments column is jsonb; pg returns either a parsed
  // array or a raw string depending on the driver path. Normalise.
  let attachments: string[] | null = null;
  if (Array.isArray(row.equipmentAttachments)) {
    attachments = row.equipmentAttachments as string[];
  } else if (typeof row.equipmentAttachments === "string") {
    try {
      const parsed = JSON.parse(row.equipmentAttachments);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch {
      // leave null
    }
  }

  const passengers: VcmPassengerCapability = {
    eligible: row.validForPassengers,
    nominalSeats,
    operationalSeats: opSeats ?? nominalSeats,
    hasAc: row.hasAc,
  };

  const cargo: VcmCargoCapability = {
    eligible: row.validForCargo,
    nominalPayloadKg: nominalPayload,
    operationalPayloadKg: opPayload ?? nominalPayload,
    boxLengthCm: row.boxLengthCm,
    boxWidthCm: row.boxWidthCm,
    boxHeightCm: row.boxHeightCm,
    axleCount: row.axleCount,
    tireCount: row.tireCount,
  };

  const equipment: VcmEquipmentCapability = {
    eligible: row.vehicleType === "equipment" ? true : null,
    operatingHours: num(row.operatingHours),
    attachments,
  };

  // Completeness scoring. We weight the axes that drive an actual
  // engine decision higher than the cosmetic ones (upholsteryType
  // etc.) — the goal is to refuse vehicles whose SAFETY-RELEVANT
  // fields are blank, not to chase a "100%" trophy for marketing
  // fields. The 11 fields below cover both family-eligibility flags
  // and the capacity ceilings the scorer reads.
  const SAFETY_FIELDS: Array<keyof VehicleRowForVcm> = [
    "vehicleType",
    "fuelType",
    "validForPassengers",
    "validForCargo",
    "payloadKg",
    "operationalPayloadKg",
    "seatCount",
    "axleCount",
    "tireCount",
    "engineDisplacementCc",
    "transmissionType",
  ];
  const populated = SAFETY_FIELDS.filter((f) => {
    const v = row[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  const completeness = Math.round((populated / SAFETY_FIELDS.length) * 100);

  return {
    vehicleId: row.id,
    family: { passengers, cargo, equipment },
    powertrain: {
      fuelType: row.fuelType,
      engineDisplacementCc: row.engineDisplacementCc,
      transmissionType: row.transmissionType,
    },
    serviceTypes: row.vehicleServiceTypes,
    completeness,
  };
}

export interface EligibilityVerdict {
  eligible: boolean;
  /** Arabic, ready for engine `reasons`/`blockers` strings. */
  reason: string | null;
}

/**
 * Hard gate: does the matrix permit this vehicle to serve the
 * requested trip-family + service-type combination?
 *
 *   • If completeness < VCM_MIN_COMPLETENESS → reject. The row
 *     isn't profiled enough for any engine decision to be safe.
 *   • If family is `passenger` and validForPassengers is FALSE
 *     → reject. (NULL passes — legacy fleet that just hasn't been
 *     tagged but cleared the completeness floor.)
 *   • If family is `cargo` and validForCargo is FALSE → reject.
 *   • If vehicleServiceTypes is populated AND doesn't contain
 *     the booking's serviceType → reject. (NULL passes for the
 *     same legacy reason.)
 *
 * Designed so a fully-profiled fleet (every column filled) gives
 * tight enforcement, while a sparsely-profiled fleet keeps working
 * — completion drives strictness.
 */
export function isEligibleForTripFamily(
  vcm: Vcm,
  family: TripFamily,
  serviceType?: string | null,
): EligibilityVerdict {
  if (vcm.completeness < VCM_MIN_COMPLETENESS) {
    return {
      eligible: false,
      reason: `الملف الفني للمركبة غير مكتمل (${vcm.completeness}%) — لا يمكن الترشيح بدون تعريف القدرة`,
    };
  }

  if (family === "passenger") {
    if (vcm.family.passengers.eligible === false) {
      return {
        eligible: false,
        reason: "المركبة غير مخصصة لنقل الركاب (validForPassengers=false)",
      };
    }
  } else if (family === "cargo") {
    if (vcm.family.cargo.eligible === false) {
      return {
        eligible: false,
        reason: "المركبة غير مخصصة لنقل الحمولة (validForCargo=false)",
      };
    }
  }

  if (
    serviceType &&
    Array.isArray(vcm.serviceTypes) &&
    vcm.serviceTypes.length > 0 &&
    !vcm.serviceTypes.includes(serviceType)
  ) {
    return {
      eligible: false,
      reason: `نوع الخدمة (${serviceType}) غير مدرج في الخدمات المعتمدة لهذه المركبة`,
    };
  }

  return { eligible: true, reason: null };
}

/**
 * Resolve the effective capacity for a given family. The engine's
 * scorer calls this instead of reading payloadKg/seatCount directly
 * so the safety margin (operational < nominal) is always honoured.
 *
 * Returns:
 *   • effective — the value to compare the request against.
 *   • nominal   — the legal/manufacturer ceiling for the warning band.
 *   • marginal  — whether `nominal > effective` (i.e. there's a band
 *                 where the engine should warn but not block).
 */
export function effectiveCapacity(
  vcm: Vcm,
  family: TripFamily,
): { effective: number | null; nominal: number | null; marginal: boolean } {
  if (family === "passenger") {
    const eff = vcm.family.passengers.operationalSeats ?? vcm.family.passengers.nominalSeats;
    const nom = vcm.family.passengers.nominalSeats;
    return {
      effective: eff,
      nominal: nom,
      marginal: eff != null && nom != null && nom > eff,
    };
  }
  const eff = vcm.family.cargo.operationalPayloadKg ?? vcm.family.cargo.nominalPayloadKg;
  const nom = vcm.family.cargo.nominalPayloadKg;
  return {
    effective: eff,
    nominal: nom,
    marginal: eff != null && nom != null && nom > eff,
  };
}
