// Task #653 — catch when the OpenAPI spec drifts from what the server actually
// returns.
//
// Task #652 closed the spec→generated-code gap (a guard that fails when the
// COMMITTED generated client/zod is stale vs a fresh regen from
// lib/api-spec/openapi.yaml). This closes the gap one level up: the spec itself
// can drift from the real Express route handlers — a handler can add / rename /
// remove a response field without anyone updating openapi.yaml, so the generated
// types silently misdescribe the live API.
//
// The generated Zod response schemas in @workspace/api-zod ARE the spec in
// machine form (Orval emits them straight from openapi.yaml). So validating a
// LIVE response against its generated Zod schema is exactly "does the server
// match the contract?":
//
//   • a removed / renamed field   → a required key is missing      → .parse() throws
//   • a type change               → a key has the wrong type       → .parse() throws
//   • an added field not in spec   → an unexpected key              → extra-key scan flags it
//
// This boots the real Express app in-process against the disposable CI Postgres,
// self-seeds a COMPLETE owner tenant via bootstrapCompany (the CI dump is
// SCHEMA-ONLY — zero seed rows), logs in as the OWNER (bypasses requireModule +
// RBAC so every representative GET is reachable), then drives a curated set of
// representative JSON GET endpoints and asserts each 200 response conforms to its
// generated Zod schema. Failures name the operationId + the exact mismatched
// field path. The build FAILS on any drift not in DRIFT_ALLOWLIST.
//
// Mirrors the dbReady auto-skip used across the *.dynamic.test.ts suite: when
// DATABASE_URL doesn't point at the marker test DB (or JWT_SECRET is missing),
// every scenario is skipped so dev boxes / CI runners without Postgres stay
// green.
//
// To run locally:
//
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   pnpm --filter @workspace/api-server test tests/integration/specContractDrift.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ZodTypeAny } from "zod";
import * as schemas from "@workspace/api-zod";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__SPEC_CONTRACT_DRIFT_653__";
const OWNER_EMAIL = "owner.spec.contract.653@ghayth.sa";
const OWNER_PASSWORD = "SpecContract#653";

// ─── The contract map (auto-discovered from the OpenAPI spec) ─────────────────
// Task #659: rather than hand-maintaining a representative sample (which let the
// many OTHER spec GETs silently drift), we parse EVERY GET operation out of the
// committed lib/api-spec/openapi.yaml `paths:` block and validate each live
// response against its generated `<PascalCaseOperationId>Response` Zod schema.
// This turns the guard into a broad net: any NEW GET added to the spec is
// covered automatically with zero edits here.
//
// Two classes of GET are skipped BY RULE (not by silent omission — every skip
// is surfaced in SKIPPED_DISCOVERY and printed in the GET scenario):
//   • path-param endpoints (`/x/{id}`) — exercised instead by the create →
//     GET-by-id write-path scenario below, which holds the seeded id.
//   • PDF / binary endpoints — no JSON response shape to validate.
type Endpoint = {
  operationId: string;
  path: string;
  schema: ZodTypeAny;
};

const SPEC_PATH = resolve(import.meta.dirname!, "../../../../lib/api-spec/openapi.yaml");

// Minimal, structure-aware scan of the OpenAPI `paths:` block (2-space path
// keys, 4-space HTTP-method keys, 6-space operationId). We only need the
// path + method + operationId — the response schema is resolved by the orval
// naming convention below — so no YAML library is pulled in. `methods` filters
// to the HTTP verbs of interest (GET for the read loop, POST/PUT/PATCH for the
// write loop), so the same parser drives both discovery passes.
function discoverOperations(
  yaml: string,
  methods: ReadonlySet<string>,
): Array<{ operationId: string; path: string; method: string }> {
  const out: Array<{ operationId: string; path: string; method: string }> = [];
  let inPaths = false;
  let curPath: string | null = null;
  let curMethod: string | null = null;
  for (const line of yaml.split("\n")) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // a new column-0 key ends the paths section
    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) { curPath = pathMatch[1]; curMethod = null; continue; }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch) { curMethod = methodMatch[1]; continue; }
    const opMatch = line.match(/^ {6}operationId:\s*(\S+)\s*$/);
    if (opMatch && curPath && curMethod && methods.has(curMethod)) {
      out.push({ operationId: opMatch[1], path: curPath, method: curMethod });
    }
  }
  return out;
}

// orval emits the response schema as `<PascalCaseOperationId>Response`.
const schemaNameFor = (operationId: string): string =>
  `${operationId[0].toUpperCase()}${operationId.slice(1)}Response`;

// Discovered GETs we deliberately don't validate here because the bare
// bootstrap tenant can't satisfy a required fixture. Keyed by operationId with
// a human reason so the exclusion is intentional + visible (currently empty —
// the path-param / PDF rules below cover every excluded GET).
const SKIP_DISCOVERED: Record<string, string> = {};

const { ENDPOINTS, SKIPPED_DISCOVERY } = ((): {
  ENDPOINTS: Endpoint[];
  SKIPPED_DISCOVERY: string[];
} => {
  const yaml = readFileSync(SPEC_PATH, "utf8");
  const eps: Endpoint[] = [];
  const skipped: string[] = [];
  for (const { operationId, path } of discoverOperations(yaml, new Set(["get"]))) {
    if (path.includes("{")) {
      skipped.push(`${operationId} (path param — covered by write-path GET-by-id)`);
      continue;
    }
    if (operationId.endsWith("Pdf") || path.endsWith("/pdf")) {
      skipped.push(`${operationId} (PDF/binary — no JSON shape)`);
      continue;
    }
    if (SKIP_DISCOVERED[operationId]) {
      skipped.push(`${operationId} (${SKIP_DISCOVERED[operationId]})`);
      continue;
    }
    const name = schemaNameFor(operationId);
    const schema = (schemas as Record<string, unknown>)[name] as ZodTypeAny | undefined;
    if (!schema) {
      skipped.push(`${operationId} (no generated ${name} schema)`);
      continue;
    }
    eps.push({ operationId, path, schema });
  }
  return { ENDPOINTS: eps, SKIPPED_DISCOVERY: skipped };
})();

// ─── Write-path coverage: auto-discovered POST/PUT/PATCH operations ───────────
// Task #664: mirror the GET auto-discovery for the mutation surface. Every
// POST/PUT/PATCH in the spec is discovered the same way; a discovered write op
// is VALIDATED only if we have a fixture able to drive it from the bare
// bootstrap tenant (a valid request body + dependency ordering). Every other
// discovered write op is SKIPPED with a visible reason (surfaced in
// SKIPPED_WRITE_DISCOVERY, never silent), so adding a new write endpoint to the
// spec shows up immediately as either covered or fixture-needed — it can't
// drift unnoticed.
type ApiResult = { status: number; json: any };
type ApiFn = (method: string, path: string, body?: unknown) => Promise<ApiResult>;

// Shared, mutable context threaded across the write loop so dependent fixtures
// (e.g. createInvoice → needs a clientId) can reuse what an earlier create
// seeded.
type WriteCtx = { tag: string; today: string; clientId: number | null };

type WriteFixture = {
  // Expected success status (201 for resource creates).
  okStatus: number;
  // Build the request body from shared context; may call `api` to seed a
  // dependency. Return null to signal the fixture couldn't build (e.g. a
  // dependency seed failed) — reported as a finding, not a silent skip.
  body: (ctx: WriteCtx, api: ApiFn) => Promise<unknown> | unknown;
  // Capture state (e.g. the created id) for later fixtures.
  capture?: (ctx: WriteCtx, json: any) => void;
  // Optional GET-by-id follow-up validating the resource's detail schema (the
  // path-param GET the read loop deliberately skips).
  getById?: {
    operationId: string;
    schema: ZodTypeAny;
    idFrom: (json: any) => number | string | null;
    pathFor: (id: number | string) => string;
  };
};

// Fixtures for the write endpoints we can drive from the bare bootstrap tenant.
// Keyed by operationId. Any discovered write op NOT here is surfaced as
// `fixture needed` in SKIPPED_WRITE_DISCOVERY (see the discovery IIFE below).
const WRITE_FIXTURES: Record<string, WriteFixture> = {
  // CRM client: create → GET-by-id (getClient).
  createClient: {
    okStatus: 201,
    body: (ctx) => ({ name: `عميل العقد ${ctx.tag}`, phone: `0512${ctx.tag}`, classification: "vip" }),
    capture: (ctx, json) => { ctx.clientId = json?.id ?? json?.clientId ?? null; },
    getById: {
      operationId: "getClient",
      schema: schemas.GetClientResponse as ZodTypeAny,
      idFrom: (json) => json?.id ?? json?.clientId ?? null,
      pathFor: (id) => `/clients/${id}`,
    },
  },
  // HR employee: create → GET-by-id (getEmployee). bootstrapCompany seeds the
  // canonical default department "الإدارة العامة" + the hr.employee_code
  // numbering scheme the create route requires.
  createEmployee: {
    okStatus: 201,
    body: (ctx) => ({
      name: `موظف العقد ${ctx.tag}`,
      phone: `0501${ctx.tag}`,
      nationalId: `21${ctx.tag}99`,
      nationality: "SA",
      gender: "male",
      email: `contract.emp.${ctx.tag}@ghayth.sa`,
      department: "الإدارة العامة",
      jobTitle: "منسق",
      role: "employee",
      salary: 5000,
    }),
    getById: {
      operationId: "getEmployee",
      schema: schemas.GetEmployeeResponse as ZodTypeAny,
      idFrom: (json) => json?.id ?? json?.employeeId ?? null,
      pathFor: (id) => `/employees/${id}`,
    },
  },
  // Finance invoice: create. bootstrapCompany seeds finance.sales_invoice
  // numbering (issueTiming 'on_draft'), so a draft create needs no extra seeding.
  // Needs a client — reuses the one createClient seeded, else seeds its own.
  // No GetInvoice response schema is generated, so only the create is validated.
  createInvoice: {
    okStatus: 201,
    body: async (ctx, api) => {
      if (ctx.clientId == null) {
        const c = await api("POST", "/clients", {
          name: `عميل الفاتورة ${ctx.tag}`,
          phone: `0513${ctx.tag}`,
          classification: "vip",
        });
        ctx.clientId = c.status === 201 ? (c.json?.id ?? c.json?.clientId ?? null) : null;
      }
      if (ctx.clientId == null) return null;
      return {
        clientId: ctx.clientId,
        date: ctx.today,
        paymentTermsDays: 30,
        lines: [{ description: "خدمة استشارية", quantity: 1, unitPrice: 1000 }],
      };
    },
  },
};

type WriteEndpoint = {
  operationId: string;
  path: string;
  method: string;
  schema: ZodTypeAny;
  fixture: WriteFixture;
};

// Discovered write ops skipped BY RULE (not by silent omission). Keyed by
// operationId with a human reason. `login` is exercised by its own dedicated
// LoginResponse test below, so it's intentionally not re-driven here.
const SKIP_WRITE: Record<string, string> = {
  login: "covered by the dedicated LoginResponse test",
};

const { WRITE_ENDPOINTS, SKIPPED_WRITE_DISCOVERY } = ((): {
  WRITE_ENDPOINTS: WriteEndpoint[];
  SKIPPED_WRITE_DISCOVERY: string[];
} => {
  const yaml = readFileSync(SPEC_PATH, "utf8");
  const eps: WriteEndpoint[] = [];
  const skipped: string[] = [];
  for (const { operationId, path, method } of discoverOperations(yaml, new Set(["post", "put", "patch"]))) {
    if (operationId.endsWith("Pdf") || path.endsWith("/pdf")) {
      skipped.push(`${operationId} (PDF/binary — no JSON shape)`);
      continue;
    }
    if (SKIP_WRITE[operationId]) {
      skipped.push(`${operationId} (${SKIP_WRITE[operationId]})`);
      continue;
    }
    const name = schemaNameFor(operationId);
    const schema = (schemas as Record<string, unknown>)[name] as ZodTypeAny | undefined;
    if (!schema) {
      skipped.push(`${operationId} (no generated ${name} schema — spec declares no response body)`);
      continue;
    }
    const fixture = WRITE_FIXTURES[operationId];
    if (!fixture) {
      skipped.push(`${operationId} (fixture needed — no request-body fixture registered)`);
      continue;
    }
    eps.push({ operationId, path, method: method.toUpperCase(), schema, fixture });
  }
  return { WRITE_ENDPOINTS: eps, SKIPPED_WRITE_DISCOVERY: skipped };
})();

// ─── Known, accepted drifts ──────────────────────────────────────────────────
// Captured baseline of pre-existing spec↔server divergences so this guard's
// forward value is blocking NEW drift (same philosophy as
// scripts/dump-drift-allowlist.txt). Each entry is `${operationId} ${issuePath}`
// where issuePath is the zod / extra-key path the scan reports. Trim this list
// as the underlying spec or handler is fixed.
// The list / auth / dashboard / health / COA / finance-stats baseline that
// used to live here has been resolved by aligning lib/api-spec/openapi.yaml to
// what the handlers actually return (paginated envelopes for lists,
// numeric-as-string for pg numerics, plus previously-undocumented fields, incl.
// the list-item shapes). What remains is the write-path (create / GET-by-id)
// baseline from Task #656, whose handlers return full persisted rows the slim
// spec schemas don't yet model. Trim these as those endpoints are aligned.
const DRIFT_ALLOWLIST = new Set<string>([
  // ── Update-path baseline (Task #657) ─────────────────────────────────────
  // The spec declares no PUT/PATCH operations, so there are no generated
  // Update*Response schemas. Each update response is validated against the
  // resource's representative full-row schema (see the update-path scenario
  // comment): updateClient → GetClientResponse, updateEmployee →
  // GetEmployeeResponse, updateInvoice → CreateInvoiceResponse.
  //
  // updateClient — PATCH re-reads + returns the full client row (`SELECT *`),
  // the same shape getClient returns minus the related arrays. nullable
  // email/source and string-serialized totalRevenue drift, plus every column
  // the slim GetClientResponse doesn't describe is an extra.
  "updateClient email: Expected string, received null",
  "updateClient source: Expected string, received null",
  "updateClient totalRevenue: Expected number, received string",
  "updateClient $.companyId — returned by server but absent from spec",
  "updateClient $.code — returned by server but absent from spec",
  "updateClient $.type — returned by server but absent from spec",
  "updateClient $.nationality — returned by server but absent from spec",
  "updateClient $.language — returned by server but absent from spec",
  "updateClient $.lat — returned by server but absent from spec",
  "updateClient $.lon — returned by server but absent from spec",
  "updateClient $.assignedTo — returned by server but absent from spec",
  "updateClient $.avgRating — returned by server but absent from spec",
  "updateClient $.tags — returned by server but absent from spec",
  "updateClient $.lastActivityAt — returned by server but absent from spec",
  "updateClient $.lastPaymentAt — returned by server but absent from spec",
  "updateClient $.notes — returned by server but absent from spec",
  "updateClient $.deletedAt — returned by server but absent from spec",
  "updateClient $.attachments — returned by server but absent from spec",
  "updateClient $.taxNumber — returned by server but absent from spec",
  "updateClient $.expectedRevenue — returned by server but absent from spec",
  "updateClient $.updatedAt — returned by server but absent from spec",
  // updateEmployee — PATCH re-reads + returns the full employee row (the same
  // shape the create handler re-reads), with string-serialized salary and many
  // iqama/visa/passport + assignment columns the slim GetEmployeeResponse
  // doesn't describe.
  "updateEmployee salary: Expected number, received string",
  // The PATCH re-read omits createdAt/companyId, which the (in-scope) full
  // GetEmployeeResponse/EmployeeDetail schema requires — genuine update-path drift.
  "updateEmployee createdAt: Required",
  "updateEmployee companyId: Required",
  "updateEmployee $.nationalId — returned by server but absent from spec",
  "updateEmployee $.iqamaNumber — returned by server but absent from spec",
  "updateEmployee $.iqamaExpiry — returned by server but absent from spec",
  "updateEmployee $.passportNumber — returned by server but absent from spec",
  "updateEmployee $.passportExpiry — returned by server but absent from spec",
  "updateEmployee $.borderNumber — returned by server but absent from spec",
  "updateEmployee $.visaNumber — returned by server but absent from spec",
  "updateEmployee $.visaType — returned by server but absent from spec",
  "updateEmployee $.visaExpiry — returned by server but absent from spec",
  "updateEmployee $.sponsorNumber — returned by server but absent from spec",
  "updateEmployee $.workPermitNumber — returned by server but absent from spec",
  "updateEmployee $.workPermitExpiry — returned by server but absent from spec",
  "updateEmployee $.iqamaStatus — returned by server but absent from spec",
  "updateEmployee $.jobTitleId — returned by server but absent from spec",
  "updateEmployee $.branchId — returned by server but absent from spec",
  "updateEmployee $.departmentId — returned by server but absent from spec",
  "updateEmployee $.managerId — returned by server but absent from spec",
  // updateInvoice — PATCH returns the full persisted invoice row (RETURNING *),
  // identical to createInvoice's shape: invoiceId absent (id instead),
  // string-serialized total, every accounting/ZATCA column an extra.
  "updateInvoice invoiceId: Required",
  "updateInvoice total: Expected number, received string",
  "updateInvoice $.id — returned by server but absent from spec",
  "updateInvoice $.companyId — returned by server but absent from spec",
  "updateInvoice $.branchId — returned by server but absent from spec",
  "updateInvoice $.clientId — returned by server but absent from spec",
  "updateInvoice $.description — returned by server but absent from spec",
  "updateInvoice $.subtotal — returned by server but absent from spec",
  "updateInvoice $.vatRate — returned by server but absent from spec",
  "updateInvoice $.vatAmount — returned by server but absent from spec",
  "updateInvoice $.paidAmount — returned by server but absent from spec",
  "updateInvoice $.status — returned by server but absent from spec",
  "updateInvoice $.paidAt — returned by server but absent from spec",
  "updateInvoice $.createdBy — returned by server but absent from spec",
  "updateInvoice $.createdAt — returned by server but absent from spec",
  "updateInvoice $.currency — returned by server but absent from spec",
  "updateInvoice $.paymentTerms — returned by server but absent from spec",
  "updateInvoice $.poNumber — returned by server but absent from spec",
  "updateInvoice $.discountAmount — returned by server but absent from spec",
  "updateInvoice $.discountPercent — returned by server but absent from spec",
  "updateInvoice $.journalEntryId — returned by server but absent from spec",
  "updateInvoice $.sentAt — returned by server but absent from spec",
  "updateInvoice $.notes — returned by server but absent from spec",
  "updateInvoice $.deletedAt — returned by server but absent from spec",
  "updateInvoice $.isTaxLinked — returned by server but absent from spec",
  "updateInvoice $.zatcaStatus — returned by server but absent from spec",
  "updateInvoice $.zatcaUuid — returned by server but absent from spec",
  "updateInvoice $.zatcaHash — returned by server but absent from spec",
  "updateInvoice $.zatcaQrCode — returned by server but absent from spec",
  "updateInvoice $.invoiceTypeCode — returned by server but absent from spec",
  "updateInvoice $.taxCategoryCode — returned by server but absent from spec",
  "updateInvoice $.exemptionReason — returned by server but absent from spec",
  "updateInvoice $.projectId — returned by server but absent from spec",
  "updateInvoice $.lastDunningStage — returned by server but absent from spec",
  "updateInvoice $.lastDunningAt — returned by server but absent from spec",
  "updateInvoice $.exchangeRate — returned by server but absent from spec",
  "updateInvoice $.updatedAt — returned by server but absent from spec",
  "updateInvoice $.costCenter — returned by server but absent from spec",
  "updateInvoice $.zatcaIcv — returned by server but absent from spec",
  "updateInvoice $.zatcaPih — returned by server but absent from spec",
  "updateInvoice $.zatcaSignature — returned by server but absent from spec",
  "updateInvoice $.zatcaClearedXml — returned by server but absent from spec",
  "updateInvoice $.zatcaClearanceStatus — returned by server but absent from spec",
  "updateInvoice $.zatcaClearedAt — returned by server but absent from spec",
  "updateInvoice $.zatcaReportedAt — returned by server but absent from spec",
  "updateInvoice $.zatcaLastError — returned by server but absent from spec",
  "updateInvoice $.approvedBy — returned by server but absent from spec",
  "updateInvoice $.approvedAt — returned by server but absent from spec",
  "updateInvoice $.postedBy — returned by server but absent from spec",
  "updateInvoice $.postedAt — returned by server but absent from spec",
  "updateInvoice $.taxCode — returned by server but absent from spec",
  "updateInvoice $.taxInclusive — returned by server but absent from spec",
  "updateInvoice $.cogsTotal — returned by server but absent from spec",
  "updateInvoice $.cogsJournalEntryId — returned by server but absent from spec",
  "updateInvoice $.amendedFromInvoiceId — returned by server but absent from spec",
  "updateInvoice $.amendedToInvoiceId — returned by server but absent from spec",
  "updateInvoice $.amendmentReason — returned by server but absent from spec",
  "updateInvoice $.amendedAt — returned by server but absent from spec",
]);

// ─── Extra-key (server returns a field the spec doesn't describe) scan ─────────
// .parse() strips unknown keys by default, so it catches removed / renamed /
// retyped fields but NOT added ones. This walks the value against the schema and
// flags object keys that have no counterpart in the schema (respecting
// .passthrough(), which intentionally allows extras). Recurses through
// objects, arrays, and `.and()` intersections; samples the first few array
// elements to bound cost.
function unwrap(s: any): any {
  let def = s?._def;
  const wrappers = new Set([
    "ZodOptional", "ZodNullable", "ZodDefault", "ZodReadonly", "ZodBranded",
  ]);
  while (def && wrappers.has(def.typeName)) {
    s = def.innerType;
    def = s?._def;
  }
  if (def?.typeName === "ZodEffects") return unwrap(def.schema);
  if (def?.typeName === "ZodLazy") return unwrap(def.getter());
  if (def?.typeName === "ZodPipeline") return unwrap(def.out);
  return s;
}

function resolveObject(s: any): { shape: Record<string, any>; passthrough: boolean } | null {
  s = unwrap(s);
  const def = s?._def;
  if (!def) return null;
  if (def.typeName === "ZodObject") {
    return { shape: def.shape(), passthrough: def.unknownKeys === "passthrough" };
  }
  if (def.typeName === "ZodIntersection") {
    const a = resolveObject(def.left);
    const b = resolveObject(def.right);
    if (!a || !b) return null;
    return { shape: { ...a.shape, ...b.shape }, passthrough: a.passthrough || b.passthrough };
  }
  return null;
}

function scanExtraKeys(schema: any, value: any, path: string, issues: string[]): void {
  const s = unwrap(schema);
  const def = s?._def;
  if (!def || value === undefined || value === null) return;

  if (def.typeName === "ZodArray") {
    if (Array.isArray(value)) {
      // Sample a few elements; emit an index-agnostic `[]` path so repeated
      // per-element drift collapses to one stable allowlist key.
      for (const el of value.slice(0, 5)) {
        scanExtraKeys(def.type, el, `${path}[]`, issues);
      }
    }
    return;
  }

  const obj = resolveObject(s);
  if (obj && typeof value === "object" && !Array.isArray(value)) {
    if (!obj.passthrough) {
      for (const k of Object.keys(value)) {
        if (!(k in obj.shape)) {
          issues.push(`${path}.${k} — returned by server but absent from spec`);
        }
      }
    }
    for (const k of Object.keys(obj.shape)) {
      if (k in value) scanExtraKeys(obj.shape[k], value[k], `${path}.${k}`, issues);
    }
  }
}

// ─── Tiny cookie-jar HTTP client ─────────────────────────────────────────────
const jar = new Map<string, string>();
function applySetCookies(res: Response): void {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

type DriftFinding = { operationId: string; issue: string };

// Index-agnostic path for a zod issue so array-element drift collapses to one
// stable allowlist key (mirrors the `[]` scanExtraKeys emits).
function zodIssue(issue: { path: (string | number)[]; message: string }): string {
  const p = issue.path.map((seg) => (typeof seg === "number" ? "[]" : seg)).join(".");
  return p ? `${p}: ${issue.message}` : issue.message;
}

// Drop the per-operation findings into a deduped, allowlist-filtered list.
function collectNovel(operationId: string, raw: string[]): DriftFinding[] {
  const seen = new Set<string>();
  const out: DriftFinding[] = [];
  for (const issue of raw) {
    if (seen.has(issue)) continue;
    seen.add(issue);
    if (DRIFT_ALLOWLIST.has(`${operationId} ${issue}`)) continue;
    out.push({ operationId, issue });
  }
  return out;
}

// Validate one live JSON body against its generated Zod schema (zod .parse for
// removed/renamed/retyped fields + extra-key scan for added ones) and append any
// novel (non-allowlisted) drift to `findings`. Shared by the GET, create, and
// GET-by-id scenarios.
function validateBody(
  operationId: string,
  schema: ZodTypeAny,
  json: any,
  findings: DriftFinding[],
): void {
  const raw: string[] = [];
  const parsed = schema.safeParse(json);
  if (!parsed.success) for (const issue of parsed.error.issues) raw.push(zodIssue(issue));
  scanExtraKeys(schema, json, "$", raw);
  findings.push(...collectNovel(operationId, raw));
}

d("OpenAPI spec ↔ server response contract drift — CI pre-merge gate (Task #653)", () => {
  let rawQuery: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  let rawExecute: (sql: string, params?: unknown[]) => Promise<unknown>;
  let server: Server | null = null;
  let baseUrl = "";
  let companyId = 0;

  async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = { cookie: cookieHeader(), "x-e2e-test": "1" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (!["GET", "HEAD"].includes(method)) {
      const csrf = jar.get("erp_csrf");
      if (csrf) headers["x-csrf-token"] = csrf;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    applySetCookies(res);
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json };
  }

  // Binary/PDF peer of `api()`: returns status + content-type + byte length
  // without assuming a JSON body. Used by the PDF/binary smoke below — a print
  // endpoint has no JSON shape to validate against a Zod schema, so the contract
  // we assert is "it returns 200 with a document content-type and a non-empty
  // body" (the a4Adapter falls back to HTML in CI where no chromium is present,
  // so accept either application/pdf or text/html).
  async function apiRaw(method: string, path: string): Promise<{ status: number; contentType: string; bytes: number }> {
    const headers: Record<string, string> = { cookie: cookieHeader(), "x-e2e-test": "1" };
    const res = await fetch(`${baseUrl}${path}`, { method, headers });
    applySetCookies(res);
    const buf = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      bytes: buf.byteLength,
    };
  }

  async function teardownTenant(): Promise<void> {
    if (!companyId) return;
    const stmts: Array<[string, unknown[]]> = [
      [`DELETE FROM rbac_user_roles WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM rbac_role_grants WHERE role_id IN (SELECT id FROM rbac_roles WHERE "companyId"=$1)`, [companyId]],
      [`DELETE FROM rbac_roles WHERE "companyId"=$1`, [companyId]],
      // Detail (GET-by-id) scenario seeds (Task #668) — penalties reference
      // journal_entries (journalEntryId) so they must go before the JE delete,
      // and the umrah rows are ordered child→parent.
      [`DELETE FROM umrah_penalties WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM umrah_groups WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM umrah_agents WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM support_tickets WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM property_units WHERE "companyId"=$1`, [companyId]],
      // Records the create/GET-by-id scenarios seed (and their dependents) —
      // ordered child→parent so FK constraints don't block the company delete.
      [`DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1)`, [companyId]],
      [`DELETE FROM journal_entries WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM invoice_lines WHERE "invoiceId" IN (SELECT id FROM invoices WHERE "companyId"=$1)`, [companyId]],
      [`DELETE FROM invoices WHERE "companyId"=$1`, [companyId]],
      // Umrah detail/statement scenario seeds (Task #665): sub-agents and any
      // print_jobs the PDF smoke writes.
      [`DELETE FROM print_jobs WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM umrah_sub_agents WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM clients WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM numbering_assignments WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM financial_periods WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM numbering_schemes WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [companyId]],
      // Owner user + any user account auto-provisioned for a created employee.
      [`DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId"=$1)`, [companyId]],
      [`DELETE FROM users WHERE email=$1`, [OWNER_EMAIL]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [companyId]],
      [`DELETE FROM companies WHERE id=$1`, [companyId]],
    ];
    for (const [sql, params] of stmts) {
      await rawExecute(sql, params).catch(() => {});
    }
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery as typeof rawQuery;
    rawExecute = rawdb.rawExecute as typeof rawExecute;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const { hashPassword } = await import("../../src/lib/auth.js");

    // Defensive: clear any leftover tenant from a prior aborted run.
    const prior = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE name=$1`, [COMPANY_NAME]);
    for (const row of prior) {
      companyId = row.id;
      await teardownTenant();
    }
    companyId = 0;

    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME],
    );
    companyId = created.id;
    await bootstrapCompany(companyId, COMPANY_NAME, null);

    const [{ id: branchId } = { id: 0 }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`,
      [companyId],
    );

    // Owner employee + assignment (role='owner' → scope.isOwner=true →
    // requireModule/authorize short-circuit, so every GET is reachable).
    const [{ id: employeeId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, status, "companyId", "branchId")
       VALUES ($1,$2,$3,$4,$5,'male','SA','active',$6,$7) RETURNING id`,
      ["مالك عقد المواصفات", "0500000653", OWNER_EMAIL, "EMP-OWNER-653", "1099999653", companyId, branchId],
    );
    await rawExecute(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,status,"hireDate","isPrimary")
       VALUES ($1,$2,$3,'المالك','owner','active',CURRENT_DATE,true)`,
      [employeeId, companyId, branchId],
    );
    const passwordHash = await hashPassword(OWNER_PASSWORD);
    await rawExecute(
      `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive")
       VALUES ($1,$2,'owner',$3,true)`,
      [OWNER_EMAIL, passwordHash, employeeId],
    );

    // Self-provision columns the committed dump has drifted out of (CI marks
    // every migration applied on the harness DB, so post-cutoff / dump-dropped
    // DDL never lands). The live DB has these; without them `SELECT *` omits the
    // column and a now-accurate spec schema reports it as missing. No-ops on the
    // live DB where the columns already exist.
    //  - clients.updatedAt: route writes `"updatedAt" = NOW()` and SELECT *s the
    //    row back; the committed dump's clients table only has createdAt.
    await rawExecute(
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS "updatedAt" timestamp without time zone DEFAULT now() NOT NULL`,
    ).catch(() => {});

    const { default: app } = await import("../../src/app.js");
    server = await new Promise<Server>((resolveServer) => {
      const s = app.listen(0, "127.0.0.1", () => resolveServer(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 120_000);

  afterAll(async () => {
    await teardownTenant().catch(() => {});
    if (server) {
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      server = null;
    }
  });

  it("login response conforms to the LoginResponse spec schema", async () => {
    const res = await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    expect(res.status, `login failed (${res.status}): ${JSON.stringify(res.json)}`).toBe(200);

    const raw: string[] = [];
    const parsed = (schemas.LoginResponse as ZodTypeAny).safeParse(res.json);
    if (!parsed.success) for (const issue of parsed.error.issues) raw.push(zodIssue(issue));
    scanExtraKeys(schemas.LoginResponse, res.json, "$", raw);

    const novel = collectNovel("login", raw);
    expect(
      novel,
      `login response drifted from LoginResponse:\n${novel.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n")}`,
    ).toHaveLength(0);
  }, 60_000);

  it("representative GET responses conform to their generated spec schemas", async () => {
    // Ensure the session is authenticated (login also runs as its own test, but
    // vitest test ordering within a file is sequential so the jar is already
    // primed; re-login defensively in case this runs first).
    if (!jar.has("erp_access")) {
      await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    }

    // A parser regression that silently emptied ENDPOINTS would make this whole
    // scenario a no-op green — assert we actually discovered the spec's GETs.
    expect(
      ENDPOINTS.length,
      "no GET operations were auto-discovered from openapi.yaml — the paths scan likely broke",
    ).toBeGreaterThan(0);

    // Surface the by-rule discovery skips (path-param / PDF) so the exclusions
    // are visible, not silent.
    if (SKIPPED_DISCOVERY.length) {
      console.log(`[spec-contract-drift] discovery skipped (by rule): ${SKIPPED_DISCOVERY.join(", ")}`);
    }
    console.log(`[spec-contract-drift] validating ${ENDPOINTS.length} auto-discovered GET endpoints: ${ENDPOINTS.map((e) => e.operationId).join(", ")}`);

    const findings: DriftFinding[] = [];
    const skipped: string[] = [];

    for (const ep of ENDPOINTS) {
      const res = await api("GET", ep.path);

      // 5xx = real server error (often itself a drift-induced crash) → fail.
      if (res.status >= 500) {
        findings.push({ operationId: ep.operationId, issue: `${res.status} server error: ${JSON.stringify(res.json).slice(0, 200)}` });
        continue;
      }
      // 4xx on an owner GET = needs params / unsupported here → don't validate.
      if (res.status !== 200) {
        skipped.push(`${ep.operationId} (${res.status})`);
        continue;
      }

      const raw: string[] = [];
      const parsed = (ep.schema as ZodTypeAny).safeParse(res.json);
      if (!parsed.success) for (const issue of parsed.error.issues) raw.push(zodIssue(issue));
      scanExtraKeys(ep.schema, res.json, "$", raw);
      findings.push(...collectNovel(ep.operationId, raw));
    }

    if (skipped.length) {
      // Surfaced for visibility, not a failure — these are endpoints that need
      // params/data we don't seed here.
      console.log(`[spec-contract-drift] skipped (non-200, not validated): ${skipped.join(", ")}`);
    }

    const detail = findings.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n");
    expect(
      findings,
      `server responses drifted from the OpenAPI spec (add to DRIFT_ALLOWLIST only if intentional):\n${detail}`,
    ).toHaveLength(0);
  }, 120_000);

  // ─── Write-path coverage (Task #656, auto-discovered in Task #664) ──────────
  // The GET-only block above can't catch a handler that drifts a CREATE response
  // shape, nor a detail (GET-by-id) endpoint that needs a path id. The write
  // surface is now AUTO-DISCOVERED from the spec (WRITE_ENDPOINTS, mirroring the
  // GET discovery): every POST/PUT/PATCH op with both a generated
  // `<PascalCaseOperationId>Response` schema and a registered fixture is driven
  // here, its create response validated, and (when the fixture declares one) its
  // GET-by-id detail response too. Write ops without a fixture are surfaced in
  // SKIPPED_WRITE_DISCOVERY, never silently dropped. Same .parse()+extra-key
  // machinery, same DRIFT_ALLOWLIST.
  it("auto-discovered create (POST) + GET-by-id responses conform to their generated spec schemas", async () => {
    if (!jar.has("erp_access")) {
      await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    }

    // A parser/fixture regression that emptied WRITE_ENDPOINTS would make this a
    // no-op green — assert we actually have writable ops to drive.
    expect(
      WRITE_ENDPOINTS.length,
      "no writable (POST/PUT/PATCH) ops were auto-discovered + fixtured from openapi.yaml — the paths scan or fixture map likely broke",
    ).toBeGreaterThan(0);

    // Surface the discovery skips (PDF / dedicated-test / no-schema / fixture-
    // needed) so each exclusion is visible, not silent.
    if (SKIPPED_WRITE_DISCOVERY.length) {
      console.log(`[spec-contract-drift] write discovery skipped: ${SKIPPED_WRITE_DISCOVERY.join(", ")}`);
    }
    console.log(`[spec-contract-drift] validating ${WRITE_ENDPOINTS.length} auto-discovered write endpoints: ${WRITE_ENDPOINTS.map((e) => e.operationId).join(", ")}`);

    const findings: DriftFinding[] = [];
    const ctx: WriteCtx = {
      tag: String(Date.now()).slice(-7),
      today: new Date().toISOString().slice(0, 10),
      clientId: null,
    };

    for (const ep of WRITE_ENDPOINTS) {
      const body = await ep.fixture.body(ctx, api);
      if (body == null) {
        findings.push({ operationId: ep.operationId, issue: "fixture failed to build a request body (dependency seed failed)" });
        continue;
      }
      const res = await api(ep.method, ep.path, body);
      if (res.status !== ep.fixture.okStatus) {
        findings.push({
          operationId: ep.operationId,
          issue: `expected ${ep.fixture.okStatus}, got ${res.status}: ${JSON.stringify(res.json).slice(0, 200)}`,
        });
        continue;
      }
      validateBody(ep.operationId, ep.schema, res.json, findings);
      ep.fixture.capture?.(ctx, res.json);

      const g = ep.fixture.getById;
      if (g) {
        const id = g.idFrom(res.json);
        if (id == null) {
          findings.push({ operationId: g.operationId, issue: "create response had no id for the GET-by-id follow-up" });
        } else {
          const got = await api("GET", g.pathFor(id));
          if (got.status === 200) {
            validateBody(g.operationId, g.schema, got.json, findings);
          } else {
            findings.push({ operationId: g.operationId, issue: `expected 200, got ${got.status}` });
          }
        }
      }
    }

    const detail = findings.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n");
    expect(
      findings,
      `create / GET-by-id responses drifted from the OpenAPI spec (add to DRIFT_ALLOWLIST only if intentional):\n${detail}`,
    ).toHaveLength(0);
  }, 120_000);

  // ─── Update-path coverage (Task #657) ──────────────────────────────────────
  // The create + GET-by-id block can't catch a handler that drifts an UPDATE
  // (PUT/PATCH) response shape — an edit handler could silently start returning
  // a different shape and nothing would flag it. The OpenAPI spec declares no
  // update operations, so there are NO generated Update*Response schemas; we
  // instead validate each update response against the resource's representative
  // generated schema (the same full-row shape an edit returns):
  //   • PATCH /clients/:id  re-reads + returns the full client row → GetClientResponse
  //   • PATCH /employees/:id re-reads + returns the full employee row → GetEmployeeResponse
  //   • PATCH /finance/invoices/:id returns the full row via RETURNING * →
  //     CreateInvoiceResponse (no GetInvoice schema is generated).
  // One representative PATCH per module, seeding its own records in the shared
  // bootstrap tenant. Same .parse()+extra-key machinery, same allowlist.
  it("representative update (PATCH) responses conform to their generated spec schemas", async () => {
    if (!jar.has("erp_access")) {
      await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    }

    const findings: DriftFinding[] = [];
    const tag = String(Date.now()).slice(-7);
    const today = new Date().toISOString().slice(0, 10);
    let clientId: number | null = null;

    // ── CRM client: create → PATCH ──
    const clientCreate = await api("POST", "/clients", {
      name: `عميل التعديل ${tag}`,
      phone: `0514${tag}`,
      classification: "vip",
    });
    clientId = clientCreate.status === 201 ? (clientCreate.json?.id ?? clientCreate.json?.clientId ?? null) : null;
    if (clientId == null) {
      findings.push({
        operationId: "updateClient",
        issue: `client seed failed (${clientCreate.status}): ${JSON.stringify(clientCreate.json).slice(0, 200)}`,
      });
    } else {
      const clientPatch = await api("PATCH", `/clients/${clientId}`, {
        name: `عميل معدّل ${tag}`,
        classification: "regular",
        notes: "تحديث تجريبي للعقد",
      });
      if (clientPatch.status === 200) {
        validateBody("updateClient", schemas.GetClientResponse, clientPatch.json, findings);
      } else {
        findings.push({
          operationId: "updateClient",
          issue: `expected 200, got ${clientPatch.status}: ${JSON.stringify(clientPatch.json).slice(0, 200)}`,
        });
      }
    }

    // ── HR employee: create → PATCH ──
    const empCreate = await api("POST", "/employees", {
      name: `موظف التعديل ${tag}`,
      phone: `0502${tag}`,
      nationalId: `22${tag}99`,
      nationality: "SA",
      gender: "male",
      email: `contract.upd.emp.${tag}@ghayth.sa`,
      department: "الإدارة العامة",
      jobTitle: "منسق",
      role: "employee",
      salary: 5000,
    });
    const employeeId = empCreate.status === 201 ? (empCreate.json?.id ?? empCreate.json?.employeeId ?? null) : null;
    if (employeeId == null) {
      findings.push({
        operationId: "updateEmployee",
        issue: `employee seed failed (${empCreate.status}): ${JSON.stringify(empCreate.json).slice(0, 200)}`,
      });
    } else {
      const empPatch = await api("PATCH", `/employees/${employeeId}`, {
        phone: `0503${tag}`,
        salary: 6000,
        jobTitle: "أخصائي",
      });
      if (empPatch.status === 200) {
        validateBody("updateEmployee", schemas.GetEmployeeResponse, empPatch.json, findings);
      } else {
        findings.push({
          operationId: "updateEmployee",
          issue: `expected 200, got ${empPatch.status}: ${JSON.stringify(empPatch.json).slice(0, 200)}`,
        });
      }
    }

    // ── Finance invoice: create → PATCH ──
    // PATCH only edits drafts (issued/ZATCA-submitted invoices reject in-place
    // edits). A fresh create is a draft with zatcaStatus NULL, so editing the
    // description is allowed; status transitions need the dedicated endpoints.
    if (clientId != null) {
      const invCreate = await api("POST", "/finance/invoices", {
        clientId,
        date: today,
        paymentTermsDays: 30,
        lines: [{ description: "خدمة استشارية", quantity: 1, unitPrice: 1000 }],
      });
      const invoiceId = invCreate.status === 201 ? (invCreate.json?.id ?? invCreate.json?.invoiceId ?? null) : null;
      if (invoiceId == null) {
        findings.push({
          operationId: "updateInvoice",
          issue: `invoice seed failed (${invCreate.status}): ${JSON.stringify(invCreate.json).slice(0, 200)}`,
        });
      } else {
        const invPatch = await api("PATCH", `/finance/invoices/${invoiceId}`, {
          description: "وصف معدّل للعقد",
        });
        if (invPatch.status === 200) {
          validateBody("updateInvoice", schemas.CreateInvoiceResponse, invPatch.json, findings);
        } else {
          findings.push({
            operationId: "updateInvoice",
            issue: `expected 200, got ${invPatch.status}: ${JSON.stringify(invPatch.json).slice(0, 200)}`,
          });
        }
      }
    }

    const detail = findings.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n");
    expect(
      findings,
      `update (PATCH) responses drifted from the OpenAPI spec (add to DRIFT_ALLOWLIST only if intentional):\n${detail}`,
    ).toHaveLength(0);
  }, 120_000);

  // ─── Umrah detail + PDF coverage (Task #665) ───────────────────────────────
  // The auto-discovery GET block skips path-param (`/x/{id}`) and PDF endpoints
  // BY RULE, and the write-path block only covers CRM/HR/Finance. This closes
  // two remaining gaps the task calls out:
  //   1. Additional `/x/{id}` JSON detail endpoints — umrah sub-agent detail
  //      (full row + statement aggregates) and umrah sub-agent statement data
  //      (running-balance ledger) — validated against their generated Zod
  //      response schemas with the same .parse()+extra-key machinery.
  //   2. PDF / binary endpoints — no JSON shape to Zod-validate, so the contract
  //      asserted is a content-type/200 smoke: the print route returns 200 with
  //      a document content-type (application/pdf or, in CI without chromium,
  //      the a4Adapter's text/html fallback) and a non-empty body.
  it("umrah detail (sub-agent + statement) JSON + PDF endpoints conform to spec", async () => {
    if (!jar.has("erp_access")) {
      await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    }

    const findings: DriftFinding[] = [];
    const tag = String(Date.now()).slice(-7);
    const today = new Date().toISOString().slice(0, 10);

    // Assert a print/binary endpoint returns 200 with a document content-type
    // and a non-empty body (the PDF smoke contract).
    function assertBinarySmoke(
      operationId: string,
      res: { status: number; contentType: string; bytes: number },
    ): void {
      if (res.status !== 200) {
        findings.push({ operationId, issue: `expected 200, got ${res.status}` });
        return;
      }
      if (!/application\/pdf|text\/html/i.test(res.contentType)) {
        findings.push({ operationId, issue: `unexpected content-type "${res.contentType}" (expected application/pdf or text/html)` });
      }
      if (res.bytes <= 0) {
        findings.push({ operationId, issue: `empty body (0 bytes)` });
      }
    }

    // ── Seed a sub-agent → GET detail + GET statement JSON + statement PDF ──
    const saCreate = await api("POST", "/umrah/sub-agents", {
      nuskCode: `NK-${tag}`,
      name: `وكيل فرعي للعقد ${tag}`,
      paymentTerms: "postpaid",
      isActive: true,
    });
    const subAgentId = saCreate.status === 201 ? (saCreate.json?.id ?? saCreate.json?.subAgentId ?? null) : null;
    if (subAgentId == null) {
      findings.push({
        operationId: "getUmrahSubAgent",
        issue: `sub-agent seed failed (${saCreate.status}): ${JSON.stringify(saCreate.json).slice(0, 200)}`,
      });
    } else {
      // 1a. Detail (full row + aggregates) → GetUmrahSubAgentResponse
      const detailGet = await api("GET", `/umrah/sub-agents/${subAgentId}`);
      if (detailGet.status === 200) {
        validateBody("getUmrahSubAgent", schemas.GetUmrahSubAgentResponse, detailGet.json, findings);
      } else {
        findings.push({
          operationId: "getUmrahSubAgent",
          issue: `expected 200, got ${detailGet.status}: ${JSON.stringify(detailGet.json).slice(0, 200)}`,
        });
      }

      // 1b. Statement ledger JSON → UmrahSubAgentStatementResponse
      const stmtGet = await api("GET", `/umrah/statements/${subAgentId}`);
      if (stmtGet.status === 200) {
        validateBody("umrahSubAgentStatement", schemas.UmrahSubAgentStatementResponse, stmtGet.json, findings);
      } else {
        findings.push({
          operationId: "umrahSubAgentStatement",
          issue: `expected 200, got ${stmtGet.status}: ${JSON.stringify(stmtGet.json).slice(0, 200)}`,
        });
      }

      // 2a. Statement PDF smoke (path-param binary).
      assertBinarySmoke(
        "umrahSubAgentStatementPdf",
        await apiRaw("GET", `/umrah/statements/${subAgentId}/pdf`),
      );
    }

    // 2b. Daily runsheet PDF smoke (date-driven, needs no seed).
    assertBinarySmoke(
      "umrahDailyRunsheetPdf",
      await apiRaw("GET", `/umrah/reports/daily-runsheet/pdf?date=${today}`),
    );

    const detail = findings.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n");
    expect(
      findings,
      `umrah detail / PDF responses drifted from the OpenAPI spec (add to DRIFT_ALLOWLIST only if intentional):\n${detail}`,
    ).toHaveLength(0);
  }, 120_000);

  // ─── /x/{id} detail-page coverage (Task #668) ──────────────────────────────
  // The auto-discovery GET block skips path-param (`/x/{id}`) endpoints BY RULE,
  // so the remaining high-traffic JSON detail pages are covered here, mirroring
  // the umrah sub-agent pattern (Task #665): seed the entity → GET the detail
  // payload → validate the FULL body against its generated Zod schema. Every
  // returned column is enumerated in the spec (orval drops additionalProperties,
  // no passthrough), so any added/renamed/retyped field surfaces as drift with
  // NO new DRIFT_ALLOWLIST entries.
  it("detail (GET /x/{id}) responses conform to spec — umrah agents/groups/pilgrims, support tickets, properties units, finance journal", async () => {
    if (!jar.has("erp_access")) {
      await api("POST", "/auth/login", { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    }
    // CI marks every migration applied on the harness DB, so post-cutoff DDL
    // (journal_lines.branchId) never lands. Self-provision it so the JE create
    // — which writes branchId on each line — doesn't 500. No-op against the
    // live DB where the column already exists.
    await rawExecute(`ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS "branchId" integer`).catch(() => {});

    const findings: DriftFinding[] = [];
    const tag = String(Date.now()).slice(-7);
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = `${new Date().getFullYear() + 1}-12-31`;

    // Validate one seeded detail endpoint: GET the path, expect 200, and run
    // the shared zod-parse + extra-key drift scan against its schema.
    async function checkDetail(operationId: string, path: string, schema: ZodTypeAny): Promise<void> {
      const res = await api("GET", path);
      if (res.status === 200) {
        validateBody(operationId, schema, res.json, findings);
      } else {
        findings.push({
          operationId,
          issue: `expected 200, got ${res.status}: ${JSON.stringify(res.json).slice(0, 200)}`,
        });
      }
    }

    // Season anchors the umrah group + pilgrim seeds.
    const season = await api("POST", "/umrah/seasons", { title: `موسم ${tag}`, startDate: today, endDate: nextYear });
    const seasonId = season.status === 201 ? (season.json?.id ?? null) : null;

    // 1. Umrah agent → detail (full row + statement aggregates).
    const agent = await api("POST", "/umrah/agents", { name: `وكيل ${tag}`, phone: `050${tag}`, country: "SA" });
    const agentId = agent.status === 201 ? (agent.json?.id ?? null) : null;
    if (agentId == null) {
      findings.push({ operationId: "getUmrahAgent", issue: `agent seed failed (${agent.status}): ${JSON.stringify(agent.json).slice(0, 200)}` });
    } else {
      await checkDetail("getUmrahAgent", `/umrah/agents/${agentId}`, schemas.GetUmrahAgentResponse);
    }

    // 2. Umrah group → detail (full row + roster + finance/schedule).
    const group = await api("POST", "/umrah/groups", { nuskGroupNumber: `NG-${tag}`, name: `مجموعة ${tag}`, seasonId, mutamerCount: 0 });
    const groupId = group.status === 201 ? (group.json?.id ?? null) : null;
    if (groupId == null) {
      findings.push({ operationId: "getUmrahGroup", issue: `group seed failed (${group.status}): ${JSON.stringify(group.json).slice(0, 200)}` });
    } else {
      await checkDetail("getUmrahGroup", `/umrah/groups/${groupId}`, schemas.GetUmrahGroupResponse);
    }

    // 3. Umrah pilgrim → detail (decrypted row + penalties).
    const pilgrim = await api("POST", "/umrah/pilgrims", { fullName: `معتمر ${tag}`, passportNumber: `P${tag}`, seasonId, agentId });
    const pilgrimId = pilgrim.status === 201 ? (pilgrim.json?.id ?? null) : null;
    if (pilgrimId == null) {
      findings.push({ operationId: "getUmrahPilgrim", issue: `pilgrim seed failed (${pilgrim.status}): ${JSON.stringify(pilgrim.json).slice(0, 200)}` });
    } else {
      await checkDetail("getUmrahPilgrim", `/umrah/pilgrims/${pilgrimId}`, schemas.GetUmrahPilgrimResponse);
    }

    // 4. Support ticket → detail (full row + replies + SLA fields).
    const ticket = await api("POST", "/support/tickets", { subject: `تذكرة ${tag}`, title: `تذكرة ${tag}`, description: "وصف المشكلة التجريبية" });
    const ticketId = ticket.status === 201 ? (ticket.json?.id ?? null) : null;
    if (ticketId == null) {
      findings.push({ operationId: "getSupportTicket", issue: `ticket seed failed (${ticket.status}): ${JSON.stringify(ticket.json).slice(0, 200)}` });
    } else {
      await checkDetail("getSupportTicket", `/support/tickets/${ticketId}`, schemas.GetSupportTicketResponse);
    }

    // 5. Property unit → detail (full row + contracts/payments/maintenance/timeline).
    const unit = await api("POST", "/properties/units", { unitNumber: `U-${tag}`, name: `وحدة ${tag}`, type: "apartment", monthlyRent: 1000 });
    const unitId = unit.status === 201 ? (unit.json?.id ?? unit.json?.unitId ?? null) : null;
    if (unitId == null) {
      findings.push({ operationId: "getPropertyUnit", issue: `unit seed failed (${unit.status}): ${JSON.stringify(unit.json).slice(0, 200)}` });
    } else {
      await checkDetail("getPropertyUnit", `/properties/units/${unitId}`, schemas.GetPropertyUnitResponse);
    }

    // 6. Finance journal entry → detail (full row + lines + reversal links).
    const je = await api("POST", "/finance/journal", {
      description: `قيد ${tag}`,
      date: today,
      lines: [
        { accountCode: "1111", debit: 100, credit: 0, description: "مدين" },
        { accountCode: "4130", debit: 0, credit: 100, description: "دائن" },
      ],
    });
    const jeId = je.status === 201 ? (je.json?.id ?? je.json?.journalId ?? null) : null;
    if (jeId == null) {
      findings.push({ operationId: "getJournalEntry", issue: `journal seed failed (${je.status}): ${JSON.stringify(je.json).slice(0, 200)}` });
    } else {
      await checkDetail("getJournalEntry", `/finance/journal/${jeId}`, schemas.GetJournalEntryResponse);
    }

    const detail = findings.map((f) => `  ✗ ${f.operationId} → ${f.issue}`).join("\n");
    expect(
      findings,
      `detail (GET /x/{id}) responses drifted from the OpenAPI spec (add to DRIFT_ALLOWLIST only if intentional):\n${detail}`,
    ).toHaveLength(0);
  }, 120_000);
});
