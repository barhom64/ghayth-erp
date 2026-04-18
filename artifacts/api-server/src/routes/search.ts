import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const { q = "", type = "all" } = req.query as any;
    const query = String(q).trim();

    if (!query || query.length < 2) {
      res.json({ results: [] });
      return;
    }

    const pattern = `%${query}%`;
    const entityType = String(type).toLowerCase();

    const shouldSearch = (t: string) => entityType === "all" || entityType === t;

    const [employees, clients, invoices, projects, tickets, units, vehicles, pilgrims, contracts, buildings, tenants] = await Promise.all([
      shouldSearch("employees") ? rawQuery<any>(
        `SELECT e.id, e.name, e."empNumber", e.email, e.phone, e."passportNumber", ea."jobTitle",
                'employee' AS type
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
         WHERE ea."companyId" = $1
           AND (e.name ILIKE $2 OR e."empNumber" ILIKE $2 OR e.email ILIKE $2 OR e.phone ILIKE $2
                OR e."passportNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("clients") ? rawQuery<any>(
        `SELECT id, name, phone, email, classification,
                'client' AS type
         FROM clients
         WHERE "companyId" = $1
           AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2 OR code ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("invoices") ? rawQuery<any>(
        `SELECT i.id, i.ref, i.status, i.total, c.name AS "clientName",
                'invoice' AS type
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId"
         WHERE i."companyId" = $1 AND i."deletedAt" IS NULL
           AND (i.ref ILIKE $2 OR c.name ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("projects") ? rawQuery<any>(
        `SELECT id, name, status, budget,
                'project' AS type
         FROM projects
         WHERE "companyId" = $1
           AND "deletedAt" IS NULL
           AND name ILIKE $2
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("tickets") ? rawQuery<any>(
        `SELECT t.id, t.ref, t.title, t.status, t.priority,
                'ticket' AS type
         FROM support_tickets t
         WHERE t."companyId" = $1
           AND (t.ref ILIKE $2 OR t.title ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("units") ? rawQuery<any>(
        `SELECT pu.id, pu."unitNumber" AS name, pu.status, pu.type, pu."monthlyRent",
                'unit' AS type
         FROM property_units pu
         WHERE pu."companyId" = $1
           AND (pu."unitNumber" ILIKE $2 OR pu.address ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("vehicles") ? rawQuery<any>(
        `SELECT v.id, CONCAT(v.make, ' ', v.model) AS name, v."plateNumber", v.status, v.year,
                'vehicle' AS type
         FROM fleet_vehicles v
         WHERE v."companyId" = $1
           AND (v."plateNumber" ILIKE $2 OR v.make ILIKE $2 OR v.model ILIKE $2
                OR v."vinNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("pilgrims") ? rawQuery<any>(
        `SELECT p.id, p."fullName" AS name, p."passportNumber", p.nationality, p.status,
                'pilgrim' AS type
         FROM umrah_pilgrims p
         WHERE p."companyId" = $1
           AND (p."fullName" ILIKE $2 OR p."passportNumber" ILIKE $2 OR p.nationality ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("contracts") ? rawQuery<any>(
        `SELECT rc.id, rc."tenantName" AS name, rc."tenantPhone", rc.status,
                pu."unitNumber", pu."buildingName",
                'contract' AS type
         FROM rental_contracts rc
         LEFT JOIN property_units pu ON pu.id = rc."unitId"
         WHERE rc."companyId" = $1
           AND (rc."tenantName" ILIKE $2 OR rc."tenantPhone" ILIKE $2 OR rc."tenantIdNumber" ILIKE $2
                OR pu."unitNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("buildings") || shouldSearch("all") ? rawQuery<any>(
        `SELECT b.id, b.name, b.city, b.type, b.status,
                COUNT(u.id) AS "totalUnits",
                'building' AS type
         FROM property_buildings b
         LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
         WHERE b."companyId" = $1
           AND (b.name ILIKE $2 OR b.city ILIKE $2 OR b.address ILIKE $2)
         GROUP BY b.id
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),

      shouldSearch("tenants") || shouldSearch("all") ? rawQuery<any>(
        `SELECT t.id, t.name, t.phone, t.email, t."nationalId",
                'tenant' AS type
         FROM tenants t
         WHERE t."companyId" = $1
           AND (t.name ILIKE $2 OR t.phone ILIKE $2 OR t."nationalId" ILIKE $2 OR t.email ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch(() => []) : Promise.resolve([]),
    ]);

    res.json({
      results: [
        ...employees.map((e: any) => ({ ...e, category: "موظفين", link: `/employees/${e.id}` })),
        ...clients.map((c: any) => ({ ...c, category: "عملاء", link: `/clients/${c.id}` })),
        ...invoices.map((i: any) => ({ ...i, category: "فواتير", link: `/finance/invoices/${i.id}` })),
        ...projects.map((p: any) => ({ ...p, category: "مشاريع", link: `/projects/${p.id}` })),
        ...tickets.map((t: any) => ({ ...t, category: "تذاكر دعم", link: `/support/${t.id}` })),
        ...units.map((u: any) => ({ ...u, category: "وحدات عقارية", link: `/properties/${u.id}` })),
        ...vehicles.map((v: any) => ({ ...v, category: "مركبات", link: `/fleet/${v.id}` })),
        ...pilgrims.map((p: any) => ({ ...p, category: "معتمرين", link: `/umrah/pilgrims/${p.id}` })),
        ...contracts.map((c: any) => ({ ...c, category: "عقود", link: `/properties/contracts?id=${c.id}` })),
        ...buildings.map((b: any) => ({ ...b, category: "مباني عقارية", link: `/properties/buildings/${b.id}` })),
        ...tenants.map((t: any) => ({ ...t, category: "مستأجرون", link: `/properties/tenants/${t.id}` })),
      ],
    });
  } catch (err) {
    handleRouteError(err, res, "Search error:");
  }
});

export default router;
