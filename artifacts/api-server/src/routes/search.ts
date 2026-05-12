import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authorize } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface SearchHit { id: number; type: string; }
interface EmployeeHit extends SearchHit { name: string; empNumber: string | null; email: string | null; phone: string | null; passportNumber: string | null; jobTitle: string | null; }
interface ClientHit extends SearchHit { name: string; phone: string | null; email: string | null; classification: string | null; }
interface InvoiceHit extends SearchHit { ref: string; status: string; total: number | string; clientName: string | null; }
interface ProjectHit extends SearchHit { name: string; status: string; budget: number | string | null; }
interface TicketHit extends SearchHit { ref: string; title: string; status: string; priority: string | null; }
interface UnitHit extends SearchHit { name: string; status: string; monthlyRent: number | string | null; }
interface VehicleHit extends SearchHit { name: string; plateNumber: string | null; status: string; year: number | null; }
interface PilgrimHit extends SearchHit { name: string; passportNumber: string | null; nationality: string | null; status: string; }
interface ContractHit extends SearchHit { name: string | null; tenantPhone: string | null; status: string; unitNumber: string | null; buildingName: string | null; }
interface BuildingHit extends SearchHit { name: string; city: string | null; status: string; totalUnits: string | number; }
interface TenantHit extends SearchHit { name: string; phone: string | null; email: string | null; nationalId: string | null; }

router.get("/", authorize({ feature: "projects", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { q = "", type = "all" } = req.query as Record<string, string | undefined>;
    const query = String(q).trim();

    if (!query || query.length < 2) {
      res.json({ results: [] });
      return;
    }

    const escaped = query.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${escaped}%`;
    const entityType = String(type).toLowerCase();

    const shouldSearch = (t: string) => entityType === "all" || entityType === t;

    const [employees, clients, invoices, projects, tickets, units, vehicles, pilgrims, contracts, buildings, tenants] = await Promise.all([
      shouldSearch("employees") ? rawQuery<EmployeeHit>(
        `SELECT e.id, e.name, e."empNumber", e.email, e.phone, e."passportNumber", ea."jobTitle",
                'employee' AS type
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
         WHERE ea."companyId" = $1
           AND e."deletedAt" IS NULL
           AND (e.name ILIKE $2 OR e."empNumber" ILIKE $2 OR e.email ILIKE $2 OR e.phone ILIKE $2
                OR e."passportNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("clients") ? rawQuery<ClientHit>(
        `SELECT id, name, phone, email, classification,
                'client' AS type
         FROM clients
         WHERE "companyId" = $1
           AND "deletedAt" IS NULL
           AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2 OR code ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("invoices") ? rawQuery<InvoiceHit>(
        `SELECT i.id, i.ref, i.status, i.total, c.name AS "clientName",
                'invoice' AS type
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
         WHERE i."companyId" = $1 AND i."deletedAt" IS NULL
           AND (i.ref ILIKE $2 OR c.name ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("projects") ? rawQuery<ProjectHit>(
        `SELECT id, name, status, budget,
                'project' AS type
         FROM projects
         WHERE "companyId" = $1
           AND "deletedAt" IS NULL
           AND name ILIKE $2
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("tickets") ? rawQuery<TicketHit>(
        `SELECT t.id, t.ref, t.title, t.status, t.priority,
                'ticket' AS type
         FROM support_tickets t
         WHERE t."companyId" = $1
           AND t."deletedAt" IS NULL
           AND (t.ref ILIKE $2 OR t.title ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("units") ? rawQuery<UnitHit>(
        `SELECT pu.id, pu."unitNumber" AS name, pu.status, pu.type, pu."monthlyRent",
                'unit' AS type
         FROM property_units pu
         WHERE pu."companyId" = $1
           AND pu."deletedAt" IS NULL
           AND (pu."unitNumber" ILIKE $2 OR pu.address ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("vehicles") ? rawQuery<VehicleHit>(
        `SELECT v.id, CONCAT(v.make, ' ', v.model) AS name, v."plateNumber", v.status, v.year,
                'vehicle' AS type
         FROM fleet_vehicles v
         WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
           AND (v."plateNumber" ILIKE $2 OR v.make ILIKE $2 OR v.model ILIKE $2
                OR v."vinNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("pilgrims") ? rawQuery<PilgrimHit>(
        `SELECT p.id, p."fullName" AS name, p."passportNumber", p.nationality, p.status,
                'pilgrim' AS type
         FROM umrah_pilgrims p
         WHERE p."companyId" = $1
           AND p."deletedAt" IS NULL
           AND (p."fullName" ILIKE $2 OR p."passportNumber" ILIKE $2 OR p.nationality ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("contracts") ? rawQuery<ContractHit>(
        `SELECT rc.id, rc."tenantName" AS name, rc."tenantPhone", rc.status,
                pu."unitNumber", pu."buildingName",
                'contract' AS type
         FROM rental_contracts rc
         LEFT JOIN property_units pu ON pu.id = rc."unitId"
         WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL
           AND (rc."tenantName" ILIKE $2 OR rc."tenantPhone" ILIKE $2 OR rc."tenantIdNumber" ILIKE $2
                OR pu."unitNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("buildings") || shouldSearch("all") ? rawQuery<BuildingHit>(
        `SELECT b.id, b.name, b.city, b.type, b.status,
                COUNT(u.id) AS "totalUnits",
                'building' AS type
         FROM property_buildings b
         LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
         WHERE b."companyId" = $1
           AND b."deletedAt" IS NULL
           AND (b.name ILIKE $2 OR b.city ILIKE $2 OR b.address ILIKE $2)
         GROUP BY b.id
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      shouldSearch("tenants") || shouldSearch("all") ? rawQuery<TenantHit>(
        `SELECT t.id, t.name, t.phone, t.email, t."nationalId",
                'tenant' AS type
         FROM tenants t
         WHERE t."companyId" = $1
           AND t."deletedAt" IS NULL
           AND (t.name ILIKE $2 OR t.phone ILIKE $2 OR t."nationalId" ILIKE $2 OR t.email ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),
    ]);

    res.json({
      results: [
        ...employees.map((e) => ({ ...e, category: "موظفين", link: `/employees/${e.id}` })),
        ...clients.map((c) => ({ ...c, category: "عملاء", link: `/clients/${c.id}` })),
        ...invoices.map((i) => ({ ...i, category: "فواتير", link: `/finance/invoices/${i.id}` })),
        ...projects.map((p) => ({ ...p, category: "مشاريع", link: `/projects/${p.id}` })),
        ...tickets.map((t) => ({ ...t, category: "تذاكر دعم", link: `/support/${t.id}` })),
        ...units.map((u) => ({ ...u, category: "وحدات عقارية", link: `/properties/${u.id}` })),
        ...vehicles.map((v) => ({ ...v, category: "مركبات", link: `/fleet/${v.id}` })),
        ...pilgrims.map((p) => ({ ...p, category: "معتمرين", link: `/umrah/pilgrims/${p.id}` })),
        ...contracts.map((c) => ({ ...c, category: "عقود", link: `/properties/contracts?id=${c.id}` })),
        ...buildings.map((b) => ({ ...b, category: "مباني عقارية", link: `/properties/buildings/${b.id}` })),
        ...tenants.map((t) => ({ ...t, category: "مستأجرون", link: `/properties/tenants/${t.id}` })),
      ],
    });
  } catch (err) {
    handleRouteError(err, res, "Search error:");
  }
});

export default router;
