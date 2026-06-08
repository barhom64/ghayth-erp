import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { maskFields } from "../lib/rbac/authorize.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";
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
interface PartyHit extends SearchHit { name: string; phone: string | null; email: string | null; nationalId: string | null; roles: string | null; }
interface LegalCaseHit extends SearchHit { name: string | null; caseNumber: string | null; status: string; }
interface SupplierHit extends SearchHit { name: string; phone: string | null; status: string; }
interface AgentHit extends SearchHit { name: string; phone: string | null; status: string; }
interface DriverHit extends SearchHit { name: string; phone: string | null; status: string; }

// Global search is cross-domain: a single endpoint that fans out across
// employees, invoices, legal cases, tenants, vehicles, etc. The route gate
// alone can't express "show only the domains this user may list", so each
// entity query is gated INDIVIDUALLY against its own feature below. Without
// this, any authenticated user who could reach the endpoint pulled back
// employee passport numbers, invoice totals, legal cases and national IDs
// far outside their role — a real cross-role data leak. We therefore do NOT
// put a coarse single-feature `authorize` here; we rely on the global auth
// layer (req.scope) + per-entity `checkAccess`, which fails closed (empty
// results) for any domain the caller may not list.
const FEATURE_BY_ENTITY: Record<string, string> = {
  employees: "hr.employees",
  clients: "crm.clients",
  invoices: "finance.invoices",
  projects: "projects",
  tickets: "support.tickets",
  units: "properties.units",
  vehicles: "fleet.vehicles",
  pilgrims: "umrah",
  contracts: "properties.contracts",
  buildings: "properties.buildings",
  tenants: "properties.tenants",
  parties: "settings",
  legal_cases: "legal.cases",
  suppliers: "finance.vendors",
  umrah_agents: "umrah",
  drivers: "fleet.vehicles",
};

router.get("/", async (req, res) => {
  try {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }
    const { q = "", type = "all" } = req.query as Record<string, string | undefined>;
    const query = String(q).trim();

    if (!query || query.length < 2) {
      res.json({ results: [] });
      return;
    }

    const escaped = query.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${escaped}%`;
    const entityType = String(type).toLowerCase();

    // Resolve list-access for every distinct feature once, then only run +
    // return the entity queries the caller is actually permitted to list.
    const featureKeys = Array.from(new Set(Object.values(FEATURE_BY_ENTITY)));
    const featureAllowed = new Map<string, boolean>();
    await Promise.all(
      featureKeys.map(async (f) => {
        const r = await checkAccess(scope, { feature: f, action: "list" });
        featureAllowed.set(f, r.allowed);
      })
    );
    const shouldSearch = (t: string) =>
      (entityType === "all" || entityType === t) &&
      featureAllowed.get(FEATURE_BY_ENTITY[t]) === true;

    const [employees, clients, invoices, projects, tickets, units, vehicles, pilgrims, contracts, buildings, tenants, parties, legalCases, suppliers, agents, drivers] = await Promise.all([
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
         LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
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

      shouldSearch("buildings") ? rawQuery<BuildingHit>(
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

      shouldSearch("tenants") ? rawQuery<TenantHit>(
        `SELECT t.id, t.name, t.phone, t.email, t."nationalId",
                'tenant' AS type
         FROM tenants t
         WHERE t."companyId" = $1
           AND t."deletedAt" IS NULL
           AND (t.name ILIKE $2 OR t.phone ILIKE $2 OR t."nationalId" ILIKE $2 OR t.email ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      // Unified-identity layer (Party model): one row per resolved human/org
      // with all the roles they play, linking to the 360 view. Empty until the
      // registry is populated (POST /parties/backfill), then "محمد" surfaces
      // once instead of N times across the silo tables.
      shouldSearch("parties") ? rawQuery<PartyHit>(
        // Was N+1: correlated string_agg per party row over party_links.
        // LIMIT 10 caps the surface but the per-row lookup still fires
        // up to 10 times during search-as-you-type. Single GROUP BY CTE
        // collapses the roles column to one scan.
        `WITH party_roles AS (
           SELECT "partyId", string_agg(DISTINCT role, ',') AS roles
             FROM party_links
            GROUP BY "partyId"
         )
         SELECT p.id, p."displayName" AS name, p.phone, p.email, p."nationalId",
                pr.roles AS roles,
                'party' AS type
           FROM parties p
           LEFT JOIN party_roles pr ON pr."partyId" = p.id
          WHERE p."companyId" = $1
            AND (p."displayName" ILIKE $2 OR p.phone ILIKE $2 OR p."nationalId" ILIKE $2 OR p.email ILIKE $2)
          LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      // القضايا
      shouldSearch("legal_cases") ? rawQuery<LegalCaseHit>(
        `SELECT id, title AS name, "caseNumber", status, 'legal_case' AS type
         FROM legal_cases
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND (title ILIKE $2 OR "caseNumber" ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      // الموردون
      shouldSearch("suppliers") ? rawQuery<SupplierHit>(
        `SELECT id, name, phone, status, 'supplier' AS type
         FROM suppliers
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND (name ILIKE $2 OR phone ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      // وكلاء العمرة
      shouldSearch("umrah_agents") ? rawQuery<AgentHit>(
        `SELECT id, name, phone, status, 'umrah_agent' AS type
         FROM umrah_agents
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND (name ILIKE $2 OR phone ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),

      // السائقون
      shouldSearch("drivers") ? rawQuery<DriverHit>(
        `SELECT id, name, phone, status, 'driver' AS type
         FROM fleet_drivers
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND (name ILIKE $2 OR phone ILIKE $2)
         LIMIT 10`,
        [scope.companyId, pattern]
      ).catch((e) => { logger.error(e, "search query failed"); return []; }) : Promise.resolve([]),
    ]);

    res.json(maskFields(req, {
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
        ...parties.map((p) => ({ ...p, category: "هوية موحّدة", link: `/parties/${p.id}/360` })),
        ...legalCases.map((c) => ({ ...c, category: "قضايا", link: `/legal/cases/${c.id}` })),
        ...suppliers.map((s) => ({ ...s, category: "موردون", link: `/finance/vendors/${s.id}` })),
        ...agents.map((a) => ({ ...a, category: "وكلاء العمرة", link: `/umrah/agents/${a.id}` })),
        ...drivers.map((d) => ({ ...d, category: "سائقون", link: `/fleet/drivers/${d.id}` })),
      ],
    }));
  } catch (err) {
    handleRouteError(err, res, "Search error:");
  }
});

export default router;
