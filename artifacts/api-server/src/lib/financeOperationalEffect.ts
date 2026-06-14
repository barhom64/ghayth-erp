// financeOperationalEffect.ts
//
// #1715 §5 — "لا يوجد ربط بلا أثر". When a finance expense is tagged as a
// vehicle/property MAINTENANCE operation, it must not just stamp dimensions
// on the JE — it must create (or could later link) the operational ticket
// and reflect it on the entity record. This realises the dormant
// OperationalEffect.maintenance_ticket contract declared in
// financeOperationContext.ts.
//
// Consolidation: reuses the existing fleet_maintenance / maintenance_requests
// tables (no new ticket store). fleet_maintenance already had linkedExpenseId;
// maintenance_requests gains it in migration 277.
//
// The caller passes the open transaction client so the ticket is created in
// the SAME transaction as the JE post — a JE failure rolls the ticket back.

// Minimal transaction-client shape (matches both pg.PoolClient and the
// client withTransaction hands its callback) — avoids coupling to pg types.
interface TxnClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

// fleet_maintenance.liabilityParty CHECK whitelist.
const VEHICLE_LIABILITY = ["company", "driver", "customer", "third_party", "insurance", "unknown"];

export interface MaintenanceTicketInput {
  companyId: number;
  branchId?: number | null;
  journalId: number;
  target: "vehicle" | "property";
  vehicleId?: number | null;
  propertyId?: number | null;
  unitId?: number | null;
  contractId?: number | null;
  cost: number;
  maintenanceType?: string | null;
  odometer?: number | null;
  costBearer?: string | null;
  performedBy?: string | null;
  description?: string | null;
  /**
   * #1715 §5 — "إنشاء تذكرة أو ربط بتذكرة قائمة". When set, link the expense to
   * this EXISTING ticket (fleet_maintenance.id for vehicle / maintenance_requests.id
   * for property) instead of creating a new one. action === "none" signals the
   * id did not match a ticket for this company, so the caller must reject.
   */
  existingTicketId?: number | null;
}

export interface MaintenanceTicketResult {
  kind: "vehicle_maintenance" | "property_maintenance" | "none";
  ticketId: number | null;
  action: "created" | "linked" | "none";
}

/**
 * Create OR link the maintenance ticket for a maintenance-tagged expense and
 * point it at the posted JE. Vehicle → fleet_maintenance (+ odometer bump on
 * the vehicle). Property → maintenance_requests. With existingTicketId set, it
 * links the existing ticket; action === "none" + ticketId null means either the
 * key dimension was missing or the existing id was not found (caller rejects on
 * the latter). Must run inside the JE transaction.
 */
export async function applyMaintenanceTicketEffect(
  client: TxnClient,
  input: MaintenanceTicketInput,
): Promise<MaintenanceTicketResult> {
  if (input.target === "vehicle" && (input.vehicleId || input.existingTicketId)) {
    const liability = input.costBearer && VEHICLE_LIABILITY.includes(input.costBearer)
      ? input.costBearer
      : null;
    let ticketId: number | null = null;
    let action: "created" | "linked" | "none" = "none";

    if (input.existingTicketId) {
      // Link mode — attach this expense to an operator-chosen existing ticket.
      const u = await client.query(
        `UPDATE fleet_maintenance
            SET "linkedExpenseId" = $2,
                cost = $3,
                "mileageAtService" = COALESCE($4, "mileageAtService"),
                "liabilityParty" = COALESCE($5, "liabilityParty")
          WHERE id = $1 AND "companyId" = $6 AND "deletedAt" IS NULL
          RETURNING id, "vehicleId"`,
        [input.existingTicketId, input.journalId, input.cost, input.odometer ?? null, liability, input.companyId],
      );
      if (u.rows.length === 0) return { kind: "none", ticketId: null, action: "none" };
      ticketId = u.rows[0].id as number;
      action = "linked";
      input = { ...input, vehicleId: input.vehicleId ?? (u.rows[0].vehicleId as number | null) };
    } else {
      const r = await client.query(
        `INSERT INTO fleet_maintenance
           ("companyId", "vehicleId", type, description, cost, "mileageAtService",
            "serviceDate", status, "linkedExpenseId", "liabilityParty", "performedBy", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'completed', $7, $8, $9, now())
         RETURNING id`,
        [
          input.companyId,
          input.vehicleId,
          input.maintenanceType || "general",
          input.description ?? null,
          input.cost,
          input.odometer ?? null,
          input.journalId,
          liability,
          input.performedBy ?? null,
        ],
      );
      ticketId = r.rows[0].id as number;
      action = "created";
    }

    // Reflect the latest odometer reading on the vehicle record.
    if (input.odometer != null && input.vehicleId) {
      await client.query(
        `UPDATE fleet_vehicles
            SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $2)
          WHERE id = $1 AND "companyId" = $3`,
        [input.vehicleId, input.odometer, input.companyId],
      );
    }
    return { kind: "vehicle_maintenance", ticketId, action };
  }

  if (input.target === "property" && (input.unitId || input.propertyId || input.existingTicketId)) {
    if (input.existingTicketId) {
      const u = await client.query(
        `UPDATE maintenance_requests
            SET "linkedExpenseId" = $2,
                "actualCost" = $3,
                category = COALESCE($4, category),
                "costResponsibility" = COALESCE($5, "costResponsibility")
          WHERE id = $1 AND "companyId" = $6 AND "deletedAt" IS NULL
          RETURNING id`,
        [input.existingTicketId, input.journalId, input.cost, input.maintenanceType || null, input.costBearer || null, input.companyId],
      );
      if (u.rows.length === 0) return { kind: "none", ticketId: null, action: "none" };
      return { kind: "property_maintenance", ticketId: u.rows[0].id as number, action: "linked" };
    }
    const r = await client.query(
      `INSERT INTO maintenance_requests
         ("companyId", "unitId", "contractId", category, description,
          "actualCost", "costResponsibility", "linkedExpenseId", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', now(), now())
       RETURNING id`,
      [
        input.companyId,
        input.unitId ?? null,
        input.contractId ?? null,
        input.maintenanceType || "general",
        input.description || "صيانة عقارية مرتبطة بمصروف",
        input.cost,
        input.costBearer || "owner",
        input.journalId,
      ],
    );
    return { kind: "property_maintenance", ticketId: r.rows[0].id as number, action: "created" };
  }

  return { kind: "none", ticketId: null, action: "none" };
}

// #1715 (owner acceptance: «شراء مركبة يفتح أصل ومركبة وإهلاك») — a capital
// purchase expense CREATES a fixed asset, which the depreciation engine then
// depreciates automatically (no schedule corruption risk: it's a brand-new
// asset, never a mutation of an existing one). Runs in the JE transaction.
export interface AssetCreationInput {
  companyId: number;
  branchId?: number | null;
  journalId: number;
  name: string;
  cost: number;
  usefulLifeYears?: number | null;
  category?: string | null;
  depreciationMethod?: string | null;
  salvageValue?: number | null;
  purchaseDate?: string | null;
}

export async function applyAssetCreationEffect(
  client: TxnClient,
  input: AssetCreationInput,
): Promise<{ assetId: number }> {
  const r = await client.query(
    `INSERT INTO fixed_assets
       ("companyId", "branchId", name, category, "purchaseDate",
        "purchaseCost", "currentBookValue", "salvageValue", "usefulLifeYears",
        "depreciationMethod", status, notes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE),
             $6, $6, $7, $8, COALESCE($9, 'straight_line'), 'active', $10, now(), now())
     RETURNING id`,
    [
      input.companyId,
      input.branchId ?? null,
      input.name,
      input.category ?? null,
      input.purchaseDate ?? null,
      input.cost,
      input.salvageValue ?? 0,
      input.usefulLifeYears ?? null,
      input.depreciationMethod ?? null,
      `أُنشئ تلقائياً من مصروف رأسمالي (قيد #${input.journalId})`,
    ],
  );
  return { assetId: r.rows[0].id as number };
}

// #1715 (owner acceptance: «وقود مركبة يظهر الممشى واللترات وسعر اللتر») — a
// vehicle fuel expense CREATES a fuel log linked to the JE and updates the
// vehicle odometer. fleet_fuel_logs already carries linkedExpenseId (same
// design as fleet_maintenance). Runs in the JE transaction.
export interface FuelLogInput {
  companyId: number;
  branchId?: number | null;
  journalId: number;
  vehicleId: number;
  totalCost: number;
  liters?: number | null;
  costPerLiter?: number | null;
  mileageAtFuel?: number | null;
  stationName?: string | null;
  fuelDate?: string | null;
  // #2234 (FIN-P4-SUPPLIER-FUEL-CONTRACT) — the SAVED supplier is the
  // commercial party (carried as vendorId on the JE line). `fleet_fuel_logs`
  // has no supplierId column, so the supplier's name becomes the DERIVED
  // stationName label (display, not source of truth). `unregisteredSupplierName`
  // is the temporary free-text exception (draft-only, policy-gated upstream).
  supplierId?: number | null;
  unregisteredSupplierName?: string | null;
}

export async function applyFuelLogEffect(
  client: TxnClient,
  input: FuelLogInput,
): Promise<{ fuelLogId: number }> {
  // Derive the display station name: prefer the saved supplier's name (the
  // real commercial identity lives on the JE as vendorId), then the temporary
  // unregistered name, then any legacy free-text stationName.
  let stationLabel: string | null = input.stationName ?? null;
  if (input.supplierId) {
    const s = await client.query(
      `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [input.supplierId, input.companyId],
    );
    if (s.rows.length > 0) stationLabel = s.rows[0].name as string;
  } else if (input.unregisteredSupplierName) {
    stationLabel = input.unregisteredSupplierName;
  }
  const r = await client.query(
    `INSERT INTO fleet_fuel_logs
       ("companyId", "vehicleId", "fuelDate", liters, "costPerLiter", "totalCost",
        "mileageAtFuel", "stationName", "linkedExpenseId", "createdAt")
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8, $9, now())
     RETURNING id`,
    [
      input.companyId,
      input.vehicleId,
      input.fuelDate ?? null,
      input.liters ?? null,
      input.costPerLiter ?? null,
      input.totalCost,
      input.mileageAtFuel ?? null,
      stationLabel,
      input.journalId,
    ],
  );
  if (input.mileageAtFuel != null) {
    await client.query(
      `UPDATE fleet_vehicles
          SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $2)
        WHERE id = $1 AND "companyId" = $3`,
      [input.vehicleId, input.mileageAtFuel, input.companyId],
    );
  }
  return { fuelLogId: r.rows[0].id as number };
}
