import { join, basename } from "node:path";
import type { Finding, ModuleScore, Recommendation } from "../types.ts";
import { REPO_ROOT, readSafe, unique, walk } from "../utils.ts";


const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");

const DOMAIN_TABLES: Record<string, string[]> = {
  finance: [
    "journal_entries", "journal_lines", "invoices", "invoice_payments",
    "payments", "account_mappings", "fiscal_periods", "fixed_assets",
    "budgets", "purchase_orders", "chart_of_accounts",
  ],
  hr: [
    "employees", "payroll_runs", "payroll_items", "payroll_deductions",
    "attendance", "leave_requests", "leave_balances", "eos_provisions",
    "employee_assignments",
  ],
  fleet: [
    "fleet_vehicles", "fleet_fuel_logs", "fleet_maintenance",
    "fleet_trips", "fleet_drivers", "fleet_traffic_violations",
    "fleet_insurance",
  ],
  warehouse: ["warehouse_products", "warehouse_movements", "warehouse_categories"],
  legal: ["legal_cases", "legal_sessions", "legal_contracts"],
  crm: ["crm_leads", "crm_opportunities", "crm_activities"],
  properties: [
    "property_buildings", "property_units", "rental_contracts",
    "rent_payments", "property_owners",
  ],
  projects: ["projects", "project_tasks", "project_costs"],
  umrah: [
    "umrah_campaigns", "umrah_pilgrims", "umrah_agents",
    "umrah_agent_invoices", "umrah_transport",
  ],
  support: ["support_tickets"],
  store: ["store_products", "store_orders", "store_categories"],
};

const TABLE_TO_DOMAIN: Record<string, string> = {};
for (const [d, ts] of Object.entries(DOMAIN_TABLES)) {
  for (const t of ts) TABLE_TO_DOMAIN[t] = d;
}

const ROUTE_DOMAIN_PREFIX: { prefix: string; domain: string }[] = [
  { prefix: "hr", domain: "hr" },
  { prefix: "finance", domain: "finance" },
  { prefix: "fleet", domain: "fleet" },
  { prefix: "warehouse", domain: "warehouse" },
  { prefix: "legal", domain: "legal" },
  { prefix: "crm", domain: "crm" },
  { prefix: "properties", domain: "properties" },
  { prefix: "projects", domain: "projects" },
  { prefix: "umrah", domain: "umrah" },
  { prefix: "support", domain: "support" },
  { prefix: "store", domain: "store" },
];

function fileDomain(file: string): string | null {
  const b = basename(file).replace(/\.ts$/, "");
  for (const { prefix, domain } of ROUTE_DOMAIN_PREFIX) {
    if (b === prefix || b.startsWith(prefix + "-")) return domain;
  }
  return null;
}

const HANDLER_RE =
  /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const RAW_QUERY_RE = /rawQuery\s*\(\s*`([\s\S]*?)`/g;
const RAW_EXEC_RE = /rawExecute\s*\(\s*`([\s\S]*?)`/g;
const TABLE_WRITE_RE =
  /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?([a-z_][a-z0-9_]*)["']?/gi;
// Match `FROM <table>` only when it follows a clause keyword or
// statement start — never when it sits inside a function call like
// `EXTRACT(YEAR FROM startdate)` or `SUBSTRING(x FROM 1 FOR 3)`.
const TABLE_READ_RE =
  /(?:^|[\s;)])(?:SELECT[\s\S]{0,400}?\sFROM|DELETE\s+FROM|UPDATE|INTO)\s+["']?([a-z_][a-z0-9_]{2,})["']?/gi;
// Drizzle ORM call detection. Drizzle exposes db.insert(table) /
// db.update(table) / db.delete(table) / db.select().from(table). The
// argument is the schema export NAME, not the SQL identifier — we
// resolve it to a table name through the alias map below (built from
// `import { foo } from "@workspace/db"` + the schema's pgTable("name")).
const DRIZZLE_INSERT_RE = /\b(?:db|tx|trx|client)\.insert\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DRIZZLE_UPDATE_RE = /\b(?:db|tx|trx|client)\.update\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DRIZZLE_DELETE_RE = /\b(?:db|tx|trx|client)\.delete\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DRIZZLE_FROM_RE = /\.from\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const STATE_RE = /\b(?:status|state)\s*[:=]\s*['"]([a-z_]+)['"]/gi;
// Real-world emission shapes used in this repo:
//   emitEvent({ ..., action: "x.y.z", ... })   ← most common
//   emitEvent({ ..., type:   "x.y.z", ... })   ← legacy
//   emitEvent("x.y.z", ...)                    ← short form
//   eventBus.emit("x.y.z", ...) / publish(...)
const EVENT_EMIT_ACTION_RE =
  /emitEvent\s*\(\s*\{[\s\S]*?\baction\s*:\s*['"]([^'"]+)['"]/g;
const EVENT_EMIT_TYPE_RE =
  /emitEvent\s*\(\s*\{[\s\S]*?\btype\s*:\s*['"]([^'"]+)['"]/g;
const EVENT_EMIT_SIMPLE_RE = /emitEvent\s*\(\s*['"]([^'"]+)['"]/g;
const EVENT_BUS_RE =
  /(?:eventBus|events)\.(?:emit|publish|dispatch)\s*\(\s*['"]([^'"]+)['"]/g;
const RBAC_RE =
  /(?:requirePermission|requireAnyPermission|authorize|requireOwnership|requireRole)\s*\(/g;
const SETTINGS_RE = /(?:getSetting|getCompanySetting|getBranchSetting|settings\.[a-z_]+)\s*\(?\s*['"]?([a-zA-Z_\.]+)?/g;
const REPORT_RE = /(?:\/reports?\/|generatePdf|exportPdf|exportExcel|generateReport)\b/g;
const AUDIT_RE = /(?:createAuditLog|auditLog\.(?:create|insert)|recordAudit)\s*\(/g;

export interface ModuleAnalysis {
  module: string;
  routeFile: string;
  handlers: { method: string; path: string; line: number }[];
  writeHandlers: { method: string; path: string; line: number; body: string }[];
  entities: string[];
  states: string[];
  events: string[];
  rbacGuards: number;
  settingsKeys: string[];
  reports: number;
  auditCalls: number;
  rawWrites: { table: string; line: number }[];
  rawReads: { table: string; line: number }[];
  source: string;
}

async function buildDrizzleAliasMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const SCHEMA = join(REPO_ROOT, "lib/db/src/schema");
  const files = await walk(SCHEMA, ".ts");
  const exportRe =
    /export\s+const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*pgTable\s*\(\s*["']([a-z_][a-z0-9_]*)["']/g;
  for (const f of files) {
    const src = await readSafe(f);
    let m: RegExpExecArray | null;
    exportRe.lastIndex = 0;
    while ((m = exportRe.exec(src))) map.set(m[1], m[2]);
  }
  return map;
}

let _aliasMapCache: Map<string, string> | null = null;
async function getAliasMap(): Promise<Map<string, string>> {
  if (!_aliasMapCache) _aliasMapCache = await buildDrizzleAliasMap();
  return _aliasMapCache;
}

export async function analyzeRoutes(): Promise<ModuleAnalysis[]> {
  const files = (await walk(ROUTES_DIR, ".ts")).sort();
  const aliasMap = await getAliasMap();
  const out: ModuleAnalysis[] = [];
  for (const file of files) {
    const src = await readSafe(file);
    if (!src) continue;
    const lines = src.split("\n");
    const lineOf = (idx: number) => src.slice(0, idx).split("\n").length;

    const handlers: ModuleAnalysis["handlers"] = [];
    const writeHandlers: ModuleAnalysis["writeHandlers"] = [];
    let m: RegExpExecArray | null;
    HANDLER_RE.lastIndex = 0;
    while ((m = HANDLER_RE.exec(src))) {
      const method = m[1].toUpperCase();
      const path = m[2];
      const line = lineOf(m.index);
      handlers.push({ method, path, line });
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        // Capture the FULL handler body (until matching close-brace of the
        // arrow function) so RBAC/audit detection sees calls placed near
        // the response — not only ones near the signature. Falls back to a
        // 60-line window if the arrow brace cannot be balanced (defensive).
        let arrowIdx = -1;
        for (let i = line - 1; i < Math.min(lines.length, line + 8); i++) {
          if (/=>\s*\{\s*$/.test(lines[i])) { arrowIdx = i; break; }
        }
        let body: string;
        if (arrowIdx === -1) {
          body = lines.slice(line - 1, line + 60).join("\n");
        } else {
          let depth = 1;
          let endIdx = lines.length - 1;
          outer: for (let i = arrowIdx + 1; i < lines.length; i++) {
            for (const ch of lines[i]) {
              if (ch === "{") depth++;
              else if (ch === "}") { depth--; if (depth === 0) { endIdx = i; break outer; } }
            }
          }
          body = lines.slice(arrowIdx, endIdx + 1).join("\n");
        }
        writeHandlers.push({ method, path, line, body });
      }
    }

    const entitiesSet = new Set<string>();
    const rawWrites: ModuleAnalysis["rawWrites"] = [];
    const rawReads: ModuleAnalysis["rawReads"] = [];
    for (const re of [RAW_QUERY_RE, RAW_EXEC_RE]) {
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const sql = m[1];
        const baseLine = lineOf(m.index);
        let mm: RegExpExecArray | null;
        TABLE_WRITE_RE.lastIndex = 0;
        while ((mm = TABLE_WRITE_RE.exec(sql))) {
          const t = mm[1].toLowerCase();
          entitiesSet.add(t);
          rawWrites.push({ table: t, line: baseLine });
        }
        TABLE_READ_RE.lastIndex = 0;
        while ((mm = TABLE_READ_RE.exec(sql))) {
          const t = mm[1].toLowerCase();
          entitiesSet.add(t);
          rawReads.push({ table: t, line: baseLine });
        }
      }
    }
    // Drizzle ORM writes/reads. The argument is the imported schema
    // alias; we resolve to the SQL identifier via the alias map. If we
    // can't resolve, we still record the alias as an entity (lower-
    // cased) so it shows up in the report — boundary checks only fire
    // when we can resolve to a known owned table.
    const recordOrm = (
      re: RegExp,
      bucket: { table: string; line: number }[] | null,
    ) => {
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const alias = m[1];
        const baseLine = lineOf(m.index);
        const tbl = aliasMap.get(alias) ?? alias.toLowerCase();
        entitiesSet.add(tbl);
        if (bucket) bucket.push({ table: tbl, line: baseLine });
      }
    };
    recordOrm(DRIZZLE_INSERT_RE, rawWrites);
    recordOrm(DRIZZLE_UPDATE_RE, rawWrites);
    recordOrm(DRIZZLE_DELETE_RE, rawWrites);
    recordOrm(DRIZZLE_FROM_RE, rawReads);

    const statesSet = new Set<string>();
    STATE_RE.lastIndex = 0;
    while ((m = STATE_RE.exec(src))) statesSet.add(m[1]);

    const eventsSet = new Set<string>();
    for (const re of [
      EVENT_EMIT_ACTION_RE,
      EVENT_EMIT_TYPE_RE,
      EVENT_EMIT_SIMPLE_RE,
      EVENT_BUS_RE,
    ]) {
      re.lastIndex = 0;
      while ((m = re.exec(src))) eventsSet.add(m[1]);
    }

    let rbacCount = 0;
    RBAC_RE.lastIndex = 0;
    while (RBAC_RE.exec(src)) rbacCount++;

    const settingsSet = new Set<string>();
    SETTINGS_RE.lastIndex = 0;
    while ((m = SETTINGS_RE.exec(src))) {
      if (m[1]) settingsSet.add(m[1]);
    }

    let reports = 0;
    REPORT_RE.lastIndex = 0;
    while (REPORT_RE.exec(src)) reports++;

    let audits = 0;
    AUDIT_RE.lastIndex = 0;
    while (AUDIT_RE.exec(src)) audits++;

    out.push({
      module: basename(file).replace(/\.ts$/, ""),
      routeFile: file,
      handlers,
      writeHandlers,
      entities: unique([...entitiesSet]).sort(),
      states: unique([...statesSet]).sort(),
      events: unique([...eventsSet]).sort(),
      rbacGuards: rbacCount,
      settingsKeys: unique([...settingsSet]).sort(),
      reports,
      auditCalls: audits,
      rawWrites,
      rawReads,
      source: src,
    });
  }
  return out;
}

export function checkBoundaries(
  modules: ModuleAnalysis[],
): { findings: Finding[]; recommendation: Recommendation } {
  const findings: Finding[] = [];
  for (const mod of modules) {
    const dom = fileDomain(mod.routeFile);
    if (!dom) continue;
    // Cross-domain WRITES → critical (data integrity risk; bypasses
    // the owning module's invariants, RBAC, and event emission).
    for (const w of mod.rawWrites) {
      const owner = TABLE_TO_DOMAIN[w.table];
      if (owner && owner !== dom) {
        findings.push({
          module: mod.module,
          axis: "boundaries",
          severity: "critical",
          message: `كتابة عابرة للحدود: ${mod.module} يكتب في جدول ${w.table} المملوك لمسار ${owner}`,
          file: `${mod.routeFile}:${w.line}`,
        });
      }
    }
    // Cross-domain READS → medium. Direct reads from another module's
    // tables couple internal schemas across modules and bypass any
    // read-side helpers; downstream schema changes will silently
    // break the consumer. Encourage going through the owning
    // module's API/service layer instead.
    const reportedReads = new Set<string>();
    for (const r of mod.rawReads) {
      const owner = TABLE_TO_DOMAIN[r.table];
      if (!owner || owner === dom) continue;
      const key = `${r.table}`;
      if (reportedReads.has(key)) continue;
      reportedReads.add(key);
      findings.push({
        module: mod.module,
        axis: "boundaries",
        severity: "medium",
        message: `قراءة عابرة للحدود: ${mod.module} يقرأ من جدول ${r.table} المملوك لمسار ${owner}`,
        file: `${mod.routeFile}:${r.line}`,
      });
    }
  }
  const rec: Recommendation =
    findings.some((f) => f.severity === "critical")
      ? "Stop Ship"
      : findings.filter((f) => f.severity === "medium").length > 30
      ? "Needs Fix"
      : "Pass";
  return { findings, recommendation: rec };
}

export { fileDomain, TABLE_TO_DOMAIN };
