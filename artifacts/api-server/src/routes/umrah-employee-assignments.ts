// ─────────────────────────────────────────────────────────────────────────────
// umrah-employee-assignments.ts — UMRAH EMPLOYEE ASSIGNMENTS (U-07 Phase 24)
//
// Route carved VERBATIM out of umrah-entities.ts into this dedicated sub-router
// — the final carve of the U-07 series. Mounted via
// `router.use(employeeAssignmentsRouter)` in umrah-entities.ts so the API
// surface stays identical (the path still resolves at
// /umrah/employees/:employeeId/assignments).
//
// Read-only — lists the active umrah-specific role/position assignments for an
// employee. Tenant-scoped on companyId. No writes, no ledger.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, parseId } from "../lib/errorHandler.js";

const router = Router();

router.get("/employees/:employeeId/assignments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const rows = await rawQuery(
      `SELECT ea.id, ea."jobTitle" AS title, ea.role, ea."branchId", ea.status
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'
       ORDER BY ea.id DESC LIMIT 50`,
      [employeeId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Employee assignments error"); }
});

export default router;
