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
}

export interface MaintenanceTicketResult {
  kind: "vehicle_maintenance" | "property_maintenance" | "none";
  ticketId: number | null;
}

/**
 * Create the maintenance ticket for a maintenance-tagged expense and link it
 * back to the posted JE. Vehicle → fleet_maintenance (+ odometer bump on the
 * vehicle). Property → maintenance_requests. Returns {kind:"none"} when the
 * target's key dimension is missing (caller already validated, but we stay
 * defensive). Must run inside the JE transaction.
 */
export async function applyMaintenanceTicketEffect(
  client: TxnClient,
  input: MaintenanceTicketInput,
): Promise<MaintenanceTicketResult> {
  if (input.target === "vehicle" && input.vehicleId) {
    const liability = input.costBearer && VEHICLE_LIABILITY.includes(input.costBearer)
      ? input.costBearer
      : null;
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
    // Reflect the latest odometer reading on the vehicle record.
    if (input.odometer != null) {
      await client.query(
        `UPDATE fleet_vehicles
            SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $2)
          WHERE id = $1 AND "companyId" = $3`,
        [input.vehicleId, input.odometer, input.companyId],
      );
    }
    return { kind: "vehicle_maintenance", ticketId: r.rows[0].id as number };
  }

  if (input.target === "property" && (input.unitId || input.propertyId)) {
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
    return { kind: "property_maintenance", ticketId: r.rows[0].id as number };
  }

  return { kind: "none", ticketId: null };
}
