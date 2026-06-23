import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EVENT_CATALOG, validateEventPayload, getEventDefinition } from "../../src/lib/eventCatalog.js";

/**
 * Catches broken background notifications BEFORE they fail silently.
 *
 * Critical events are emitted fire-and-forget via emitEvent(...).catch(...).
 * emitEvent runs validateEventPayload and, for a critical event, THROWS when a
 * required payload field is missing — but the throw lands in the caller's
 * `.catch` and is only logged, so the HTTP response stays green while the
 * downstream notification/automation never fires. No test previously asserted
 * the emitted payloads carry their catalog-required fields, so this drift was
 * invisible until something downstream broke.
 *
 * validateEventPayload looks a field up as `payload[field] ?? payload.after?.[field]`
 * — it does NOT read `details` (a JSON string) and does NOT map `entityId`→`id`.
 * So a required field MUST appear either as a top-level key of the emitEvent
 * argument OR inside its `after` object. This suite statically extracts EVERY
 * literal-action emitEvent(...) call across src/routes/** and src/lib/** , and
 * for those whose action maps to a `critical:true` catalog entry, asserts each
 * catalog-required field is reachable — mirroring validateEventPayload exactly,
 * with the catalog as the single source of truth.
 *
 * Pre-existing gaps are captured in EMIT_GAP_ALLOWLIST as a frozen baseline (see
 * the two categories documented on it). The forward value of this gate is
 * blocking any NEW critical emit gap, and flagging when a baselined gap gets
 * fixed (so its allowlist entry must be removed). Dynamic (template/variable)
 * action emits cannot be resolved statically and are out of scope.
 */

const SRC_DIR = join(import.meta.dirname!, "../../src");
const SCAN_DIRS = [join(SRC_DIR, "routes"), join(SRC_DIR, "lib")];

/**
 * Extract the balanced-brace argument object of the emitEvent(...) call whose
 * body declares `action: "<eventName>"`. Returns the raw `{ ... }` text.
 */
function extractEmitArg(src: string, eventName: string): string {
  const actionNeedle = new RegExp(`action:\\s*["']${eventName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
  const actionMatch = actionNeedle.exec(src);
  expect(actionMatch, `no emitEvent call found for action "${eventName}"`).not.toBeNull();
  const actionIdx = actionMatch!.index;

  // Walk backwards to the opening "{" of the emitEvent argument object.
  const callIdx = src.lastIndexOf("emitEvent", actionIdx);
  expect(callIdx, `action "${eventName}" is not inside an emitEvent call`).toBeGreaterThanOrEqual(0);
  const braceStart = src.indexOf("{", callIdx);
  expect(braceStart).toBeGreaterThanOrEqual(0);
  const end = balanceFrom(src, braceStart);
  expect(end, `could not balance braces for "${eventName}" emitEvent arg`).toBeGreaterThan(braceStart);
  return src.slice(braceStart, end + 1);
}

/**
 * Index of the matching close brace for the `{` at `braceStart`, string-aware.
 */
function balanceFrom(src: string, braceStart: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === inStr && src[i - 1] !== "\\") inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Collect the keys a required field could be satisfied by:
 *   • top-level keys of the emitEvent argument object
 *   • keys inside its nested `after: { ... }` object
 * This mirrors validateEventPayload's `payload[field] ?? payload.after?.[field]`.
 *
 * NOTE: the outer `{ }` of the emitEvent argument MUST be stripped before the
 * depth-0 comma split, otherwise the opening brace pushes every top-level key to
 * depth 1 and they are never captured (top-level keys like `entityId` would be
 * silently invisible).
 */
function reachableKeys(emitArg: string): Set<string> {
  let body = emitArg.trim();
  if (body.startsWith("{")) body = body.slice(1);
  if (body.endsWith("}")) body = body.slice(0, -1);

  const keys = new Set<string>();

  // Pull out the nested `after: { ... }` block first so we can scan it too,
  // then blank it out of the top-level scan to avoid leaking nested keys up.
  let topLevel = body;
  const afterIdx = body.search(/\bafter\s*:\s*\{/);
  if (afterIdx >= 0) {
    const braceStart = body.indexOf("{", afterIdx);
    const end = balanceFrom(body, braceStart);
    if (end > braceStart) {
      const afterBody = body.slice(braceStart + 1, end);
      for (const k of extractObjectKeys(afterBody)) keys.add(k);
      topLevel = body.slice(0, afterIdx) + body.slice(end + 1);
    }
  }

  for (const k of extractObjectKeys(topLevel)) keys.add(k);
  return keys;
}

/**
 * Extract identifier keys at brace-depth 0 of a given object body, covering
 * BOTH `foo: <expr>` (explicit) and `foo` (ES6 shorthand) forms. Depth-aware
 * so nested objects / JSON.stringify(...) args / call arguments don't leak
 * their inner keys. Works by splitting the body into top-level segments on
 * depth-0 commas, then reading the leading identifier of each segment.
 */
function extractObjectKeys(objBody: string): string[] {
  const out: string[] = [];
  const segments: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < objBody.length; i++) {
    const ch = objBody[i];
    if (inStr) { if (ch === inStr && objBody[i - 1] !== "\\") inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) { segments.push(objBody.slice(start, i)); start = i + 1; }
  }
  segments.push(objBody.slice(start));

  for (const seg of segments) {
    // A segment is either `key: value` or shorthand `key`. The key is the
    // leading identifier; for the `key: value` form we stop at the colon.
    const m = /^\s*([A-Za-z_$][\w$]*)\s*(:|$)/.exec(seg);
    if (m) out.push(m[1]);
  }
  return out;
}

interface EmitCall {
  file: string; // path relative to SRC_DIR, e.g. "src/routes/finance-invoices.ts"
  line: number;
  action: string;
  emitArg: string;
}

/**
 * Find every emitEvent({ ... }) call in `src` whose first argument is an inline
 * object literal with a string-literal `action:`. Dynamic actions (template
 * literals / variables) and non-object-literal first args are skipped — they
 * cannot be statically resolved to a catalog entry.
 */
function extractEmitCalls(src: string, relFile: string): { resolved: EmitCall[]; dynamic: number } {
  const resolved: EmitCall[] = [];
  let dynamic = 0;
  let idx = 0;
  while ((idx = src.indexOf("emitEvent", idx)) >= 0) {
    const parenRel = src.slice(idx + "emitEvent".length).search(/^\s*\(/);
    if (parenRel < 0) { idx += "emitEvent".length; continue; }
    const parenIdx = idx + "emitEvent".length + src.slice(idx + "emitEvent".length).indexOf("(");
    let j = parenIdx + 1;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== "{") { idx = parenIdx + 1; continue; } // first arg not an inline object literal
    const end = balanceFrom(src, j);
    if (end < 0) { idx = parenIdx + 1; continue; }
    const emitArg = src.slice(j, end + 1);
    const line = src.slice(0, idx).split("\n").length;
    const am = /\baction\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/.exec(emitArg);
    if (!am) { dynamic++; idx = end + 1; continue; }
    resolved.push({ file: relFile, line, action: am[2], emitArg });
    idx = end + 1;
  }
  return { resolved, dynamic };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

interface AllowEntry {
  file: string;
  action: string;
  missing: string[];
  cat: "A" | "B";
}

/**
 * Frozen baseline of pre-existing critical emit gaps. The forward value of the
 * contract test is blocking NEW gaps, not these. Two categories:
 *
 *  A — auto-generated short catalog entry that requires a literal `id`. The
 *      identifier is carried by the mandatory `entityId` param, not an `id`
 *      key, so validateEventPayload (which does NOT map entityId→id) rejects
 *      it and the critical event silently drops. Remediation is NOT a blind
 *      per-site edit: many of these actions have registered listeners that do
 *      `gl_post` (custody.settled, journal.reversed, payment_run.executed,
 *      bad_debt.posted, hr.accruals.posted, fiscal.year_end_closed, …) which
 *      are currently dormant precisely because the emit throws first. Making
 *      the payload valid would wake those listeners and risk double-posting
 *      GL, so it must be done deliberately (validator entityId→id mapping or
 *      per-listener review), tracked as a follow-up.
 *
 *  B — required business field(s) are passed inside the `details` JSON string,
 *      which validateEventPayload ignores. Remediation = move them into
 *      `after:{}` (the same fix already applied to invoice.paid /
 *      umrah.penalty.waived_bulk), tracked as a follow-up.
 *
 * Keyed by file + action + exact missing-field set. Adding a NEW critical emit
 * (or changing which fields a baselined one omits) is NOT covered and fails the
 * gate. Fixing a baselined gap makes its entry stale and also fails the gate
 * (so the entry must then be deleted).
 */
const EMIT_GAP_ALLOWLIST: AllowEntry[] = [
  { file: "src/lib/cronScheduler.ts", action: "fleet.vehicle.breakdown", missing: ["reason","vehicleId"], cat: "B" },
  { file: "src/lib/cronScheduler.ts", action: "hr.letter.approved", missing: ["id"], cat: "A" },
  { file: "src/lib/cronScheduler.ts", action: "leave.approved", missing: ["id"], cat: "A" },
  { file: "src/lib/cronScheduler.ts", action: "leave.completed", missing: ["id"], cat: "A" },
  { file: "src/lib/cronScheduler.ts", action: "legal.case.created", missing: ["caseId","caseType","hearingDate"], cat: "B" },
  { file: "src/lib/umrahCommissionEngine.ts", action: "umrah.commission.calculated", missing: ["agentId","amount","commissionId","period"], cat: "B" },
  // umrah.import.confirmed batchId gap — FIXED (batchId now in the event payload).
  { file: "src/lib/umrahInvoicingEngine.ts", action: "umrah.invoice.generated", missing: ["invoiceId","pilgrimId","total"], cat: "B" },
  { file: "src/lib/umrahInvoicingEngine.ts", action: "umrah.payment.received", missing: ["amount","invoiceId","method","paymentId"], cat: "B" },
  { file: "src/lib/umrahInvoicingEngine.ts", action: "umrah.sales_invoice.created", missing: ["invoiceId"], cat: "B" },
  { file: "src/routes/accounting-engine.ts", action: "accounting.journal_template.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/accounting-engine.ts", action: "accounting.subsidiary_account.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/admin.ts", action: "system.stop.activated", missing: ["id"], cat: "A" },
  { file: "src/routes/admin.ts", action: "system.stop.deactivated", missing: ["id"], cat: "A" },
  { file: "src/routes/employees.ts", action: "employee.terminated", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-accounts.ts", action: "account.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-budget.ts", action: "budget.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-cost-centers.ts", action: "cost_center.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-custodies.ts", action: "custody.settled", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-hardening.ts", action: "bank_guarantee.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-hardening.ts", action: "fiscal_period.created", missing: ["id","name"], cat: "B" },
  { file: "src/routes/finance-invoices.ts", action: "bad_debt.posted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-invoices.ts", action: "invoice.approved", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-invoices.ts", action: "invoice.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-invoices.ts", action: "invoice.posted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-journal.ts", action: "fiscal.year_end_closed", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-journal.ts", action: "journal.reversed", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-purchase.ts", action: "payment_run.executed", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-recurring.ts", action: "recurring_journal.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/finance-vendors.ts", action: "vendor.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/fleet.ts", action: "fleet.vehicle.breakdown", missing: ["reason","vehicleId"], cat: "B" },
  { file: "src/routes/governance.ts", action: "governance.compliance.created", missing: ["complianceId","dueDate","framework"], cat: "B" },
  { file: "src/routes/hr-discipline.ts", action: "hr.discipline.regulation.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr-loans.ts", action: "hr.loan.approved", missing: ["id"], cat: "A" },
  { file: "src/routes/hr-overtime.ts", action: "hr.overtime.approved", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "holiday.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "hr.accruals.posted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "idp.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "leave.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "letter.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "payroll.completed", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "payroll.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "payroll.posted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "performance.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "salary_component.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "shift.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/hr.ts", action: "violation.deleted", missing: ["id"], cat: "A" },
  { file: "src/routes/legal.ts", action: "legal.case.created", missing: ["caseId","caseType","hearingDate"], cat: "B" },
  { file: "src/routes/obligations.ts", action: "obligation.cancelled_by_entity", missing: ["id"], cat: "A" },
  { file: "src/routes/obligations.ts", action: "obligation.cancelled", missing: ["id"], cat: "A" },
  { file: "src/routes/obligations.ts", action: "obligation.created", missing: ["id","name"], cat: "B" },
  { file: "src/routes/obligations.ts", action: "obligation.met_by_entity", missing: ["id"], cat: "A" },
  { file: "src/routes/obligations.ts", action: "obligation.met", missing: ["id"], cat: "A" },
  { file: "src/routes/obligations.ts", action: "obligation.scan_triggered", missing: ["id"], cat: "A" },
  { file: "src/routes/operationsCenter.ts", action: "daily_close.executed", missing: ["id"], cat: "A" },
  { file: "src/routes/requests.ts", action: "legal.case.created", missing: ["caseId","caseType","hearingDate"], cat: "B" },
  { file: "src/routes/settings.ts", action: "company.created", missing: ["name"], cat: "B" },
  { file: "src/routes/umrah-commission.ts", action: "umrah.commission.calculated", missing: ["agentId","amount","commissionId","period"], cat: "B" },
  { file: "src/routes/umrah-entities.ts", action: "umrah.invoice.generated", missing: ["invoiceId","pilgrimId"], cat: "B" },
  // U-07 Phase 20 — the payment register route (and its emit) moved verbatim to
  // umrah-payments.ts; the pre-existing baselined gap follows it unchanged.
  { file: "src/routes/umrah-payments.ts", action: "umrah.payment.received", missing: ["amount","invoiceId","method","paymentId"], cat: "B" },
  { file: "src/routes/umrah-entities.ts", action: "umrah.sales_invoice.created", missing: ["invoiceId"], cat: "B" },
];

function gapKey(file: string, action: string, missing: string[]): string {
  return `${file}::${action}::${[...missing].sort().join(",")}`;
}

interface Failure {
  file: string;
  line: number;
  action: string;
  missing: string[];
  reachable: string[];
}

// --- Scan once, shared across the comprehensive suite -----------------------
const ALL_CALLS: EmitCall[] = [];
let DYNAMIC_COUNT = 0;
for (const dir of SCAN_DIRS) {
  for (const abs of walk(dir)) {
    const rel = "src" + abs.slice(SRC_DIR.length);
    const { resolved, dynamic } = extractEmitCalls(readFileSync(abs, "utf8"), rel);
    ALL_CALLS.push(...resolved);
    DYNAMIC_COUNT += dynamic;
  }
}

const CRITICAL_FAILURES: Failure[] = [];
for (const c of ALL_CALLS) {
  const def = getEventDefinition(c.action);
  if (!def || !def.critical) continue;
  const reachable = reachableKeys(c.emitArg);
  const missing = Object.keys(def.payload).filter((f) => !reachable.has(f));
  if (missing.length) {
    CRITICAL_FAILURES.push({ file: c.file, line: c.line, action: c.action, missing, reachable: [...reachable] });
  }
}

// ---------------------------------------------------------------------------
// Originally-guarded events (#674): keep the explicit, high-signal assertions.
// ---------------------------------------------------------------------------
const ROUTES_DIR = join(SRC_DIR, "routes");
const GUARDED_EMITS = [
  { event: "invoice.paid", source: readFileSync(join(ROUTES_DIR, "finance-invoices.ts"), "utf8") },
  { event: "umrah.penalty.waived_bulk", source: readFileSync(join(ROUTES_DIR, "umrah.ts"), "utf8") },
];

describe("event payload contract — originally-guarded critical emits", () => {
  for (const { event, source } of GUARDED_EMITS) {
    describe(event, () => {
      const def = EVENT_CATALOG.find((e) => e.name === event);

      it("has a catalog entry flagged critical", () => {
        expect(def, `"${event}" must exist in EVENT_CATALOG`).toBeTruthy();
        expect(def!.critical, `"${event}" should be critical so a missing field is loud, not silent`).toBe(true);
      });

      it("emits every catalog-required field as a top-level or `after` key", () => {
        const emitArg = extractEmitArg(source, event);
        const reachable = reachableKeys(emitArg);
        const required = Object.keys(def!.payload);
        const missing = required.filter((f) => !reachable.has(f));
        expect(
          missing,
          `${event} emit is missing required payload field(s) [${missing.join(", ")}] — ` +
            `they must be top-level keys or inside \`after:{}\` (validateEventPayload ignores \`details\`). ` +
            `reachable keys: ${[...reachable].join(", ")}`,
        ).toEqual([]);
      });

      it("a representative payload built from `after` passes validateEventPayload", () => {
        const after: Record<string, unknown> = {};
        for (const [field, type] of Object.entries(def!.payload)) {
          after[field] = type === "number" ? 1 : type === "string" ? "x" : 1;
        }
        const result = validateEventPayload(event, { action: event, after });
        expect(result.cataloged).toBe(true);
        expect(result.valid, result.warnings.join("; ")).toBe(true);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Comprehensive sweep: EVERY critical emit across routes/** and lib/**.
// ---------------------------------------------------------------------------
describe("event payload contract — every critical emit carries its required fields", () => {
  it("finds a meaningful number of emitEvent call sites (scan sanity)", () => {
    // Guards against the static scanner silently matching nothing (e.g. a refactor
    // that renames emitEvent), which would make the whole suite a false green.
    expect(ALL_CALLS.length).toBeGreaterThan(300);
  });

  it("has no NEW critical emit gap outside the frozen baseline", () => {
    const allowed = new Set(EMIT_GAP_ALLOWLIST.map((e) => gapKey(e.file, e.action, e.missing)));
    const novel = CRITICAL_FAILURES.filter((f) => !allowed.has(gapKey(f.file, f.action, f.missing)));
    expect(
      novel.map((f) => `${f.file}:${f.line} ${f.action} missing=[${f.missing.join(",")}] reachable=[${f.reachable.join(",")}]`),
      "NEW critical emit gap(s) detected. A critical event is missing catalog-required payload field(s); " +
        "at runtime emitEvent throws and the event silently drops (no event_logs row, no listener). " +
        "Fix the emit to carry the field(s) as a top-level or `after:{}` key (NOT inside `details`), " +
        "or — only if genuinely acceptable — add it to EMIT_GAP_ALLOWLIST with a reason.",
    ).toEqual([]);
  });

  it("has no stale baseline entry (a baselined gap was fixed — remove its allowlist entry)", () => {
    const actual = new Set(CRITICAL_FAILURES.map((f) => gapKey(f.file, f.action, f.missing)));
    const stale = EMIT_GAP_ALLOWLIST.filter((e) => !actual.has(gapKey(e.file, e.action, e.missing)));
    expect(
      stale.map((e) => `${e.file} ${e.action} missing=[${e.missing.join(",")}]`),
      "Stale EMIT_GAP_ALLOWLIST entry — this gap no longer reproduces (the emit was fixed, the action " +
        "is no longer critical, or the call moved/was removed). Delete the listed entry so the baseline " +
        "keeps shrinking and stays an accurate record of real gaps.",
    ).toEqual([]);
  });
});
