import { config } from "./config.js";

/**
 * Ejar contract reader — Mock-First.
 *
 * Reads a contract record from the Ejar platform by ejarNumber and
 * returns a canonical shape the Properties create-form can pre-fill
 * + lock when contractSource='ejar'. Pre-fill avoids re-entering
 * data that already lives on Ejar; locking the reference fields
 * (parties, unit, amounts) enforces the doctrine rule that an
 * Ejar-bound contract is read-only locally.
 *
 * Why Mock-First: the Ejar developer portal (ejarClient.ts) exposes
 * submit + status endpoints today, but a documented authenticated
 * read endpoint for full contract details requires per-tenant
 * onboarding paperwork and operator-by-operator credentials. The
 * doctrine calls for the contract reader to be shippable behind a
 * stable interface so the form can wire against it now, and the
 * real adapter slots in later without a UI rewrite.
 *
 * The interface is the contract; the mock is one implementation.
 * `getEjarReader()` picks between mock / real off the
 * EJAR_READER_MODE env. Tests can also call `mockEjarReader()`
 * directly.
 */

export interface EjarContractData {
  ejarNumber: string;
  /** Activity branch the contract is registered as. Maps 1:1 onto
   *  the four-branch `contractType` introduced in #1999 (residential
   *  and commercial only — Ejar does not handle sale/management). */
  contractType: "residential_rent" | "commercial_rent";
  contractNumber: string | null;

  startDate: string;
  endDate: string;
  monthlyRent: number;
  yearlyRent: number;
  totalContractValue: number;
  paymentFrequency: "monthly" | "quarterly" | "semi_annual" | "annual";

  // Parties — locked on the local form once contractSource='ejar'.
  landlordName: string;
  landlordIdNumber: string;
  tenantName: string;
  tenantIdNumber: string;
  tenantPhone: string | null;
  tenantEmail: string | null;

  // Unit reference — locked once contractSource='ejar'.
  unitNumber: string;
  buildingName: string;
  city: string;
  district: string | null;

  // Terms.
  gracePeriodDays: number;
  terminationNoticeDays: number;
  autoRenewal: boolean;
  electricityResponsibility: "tenant" | "landlord";
  waterResponsibility: "tenant" | "landlord";
  gasResponsibility: "tenant" | "landlord";
  maintenanceResponsibility: "tenant" | "landlord" | "shared";

  // Status reported by Ejar.
  ejarStatus: "active" | "draft" | "expired";
  registrationDate: string;
}

export interface EjarReader {
  /** Read a contract by ejarNumber. Returns null when the number is
   *  unknown to the source; throws on transient / configuration
   *  errors so callers can distinguish "not found" from "couldn't
   *  reach Ejar". */
  read(ejarNumber: string): Promise<EjarContractData | null>;
}

/**
 * Mock implementation — deterministic by ejarNumber so the same
 * input always produces the same output (unit tests + the
 * `seed-demo-data` flow can rely on this).
 *
 * Conventions:
 *   - Valid format: `EJ-` followed by 4+ digits. Anything else → null.
 *   - The first digit after the dash drives the activity branch:
 *       1 → residential_rent  (the common case)
 *       2 → commercial_rent
 *       9 → returns null deliberately ("not found" fixture for tests)
 *   - All numeric amounts derive from the trailing digits so each
 *     fixture is distinguishable without hardcoding tables.
 */
class MockEjarReader implements EjarReader {
  async read(ejarNumber: string): Promise<EjarContractData | null> {
    if (!isValidEjarFormat(ejarNumber)) return null;
    const tail = ejarNumber.slice(3);
    const branchDigit = tail[0]!;
    if (branchDigit === "9") return null; // explicit not-found fixture

    const numericTail = Number(tail);
    const isCommercial = branchDigit === "2";
    const monthlyRent = isCommercial ? 8000 + (numericTail % 1000) : 2500 + (numericTail % 500);
    const monthlyMaintenance: EjarContractData["maintenanceResponsibility"] =
      isCommercial ? "tenant" : "shared";

    return {
      ejarNumber,
      contractType: isCommercial ? "commercial_rent" : "residential_rent",
      contractNumber: `EJC-${tail}`,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      monthlyRent,
      yearlyRent: monthlyRent * 12,
      totalContractValue: monthlyRent * 12,
      paymentFrequency: "monthly",
      landlordName: isCommercial ? "شركة الديار للعقار" : "محمد عبدالله السبيعي",
      landlordIdNumber: isCommercial ? "7012345678" : "1012345678",
      tenantName: isCommercial ? `شركة المستأجر #${tail}` : `مستأجر #${tail}`,
      tenantIdNumber: `10${tail}`.padEnd(10, "0"),
      tenantPhone: `+9665${tail}`.slice(0, 13),
      tenantEmail: null,
      unitNumber: `U-${tail.slice(-3)}`,
      buildingName: isCommercial ? "مجمّع الأعمال" : "مبنى السكني الأول",
      city: "الرياض",
      district: isCommercial ? "العليا" : "النرجس",
      gracePeriodDays: 5,
      terminationNoticeDays: isCommercial ? 90 : 30,
      autoRenewal: !isCommercial,
      electricityResponsibility: "tenant",
      waterResponsibility: "tenant",
      gasResponsibility: "tenant",
      maintenanceResponsibility: monthlyMaintenance,
      ejarStatus: "active",
      registrationDate: "2025-12-15",
    };
  }
}

/**
 * Real adapter stub — kicks in when EJAR_READER_MODE=real. Today the
 * Ejar developer portal does not document a free authenticated read
 * endpoint that returns the full contract shape we need; until that
 * lands the stub throws so an accidental rollout to real mode fails
 * loudly instead of silently returning empty data.
 *
 * The actual integration belongs in this file (not ejarClient.ts)
 * because it shares the same EJAR_* env wiring but produces a
 * different shape — keeping it here means the swap is one file
 * edit, not a hunt across the codebase.
 */
class RealEjarReader implements EjarReader {
  async read(_ejarNumber: string): Promise<EjarContractData | null> {
    throw new Error(
      "EJAR_READER_MODE=real but the real Ejar read adapter is not yet implemented. " +
      "Set EJAR_READER_MODE=mock (or unset) until the platform read endpoint is wired.",
    );
  }
}

export function isValidEjarFormat(ejarNumber: unknown): ejarNumber is string {
  return typeof ejarNumber === "string" && /^EJ-\d{4,}$/.test(ejarNumber);
}

export function mockEjarReader(): EjarReader {
  return new MockEjarReader();
}

/**
 * Process-wide reader selector. Mock is the default — the brief is
 * explicit that we ship the mock and let operators flip the env
 * once their tenant has Ejar credentials onboarded. Mode lives on
 * the typed config (lib/config.ts → `config.ejar.readerMode`) so
 * the env-var validation + default flow through one place.
 */
export function getEjarReader(): EjarReader {
  return config.ejar.readerMode === "real" ? new RealEjarReader() : new MockEjarReader();
}
