/**
 * HR-Wave-0 / 0.3 — Backend route-guards ratchet.
 *
 * The mandate's «حماية الوصول على الـbackend، لا بإخفاء الرابط» rule
 * is already honoured by every HR router today (visual inspection
 * confirmed `authorize({...})` on the 201 endpoints across the 10
 * HR route files). This ratchet pins that invariant so a future PR
 * can't quietly add an HR endpoint without the gate.
 *
 * Mechanism:
 *   1. Walk every `router.{get,post,put,patch,delete}("…", …)`
 *      declaration in each HR route file.
 *   2. For each, look ahead at most 240 characters (covers
 *      single-line + multi-line registrations) for an `authorize(`
 *      middleware call.
 *   3. Anything without `authorize(` is reported as a violation
 *      with file + line + matched declaration.
 *   4. Count pin: total endpoint count + protected count are
 *      asserted so the snapshot only moves with intent.
 *
 * If a future legitimate exception arises (e.g. a webhook endpoint
 * that runs without the session-bound authorize gate), add it to
 * INTENTIONAL_UNGATED below with a one-line justification — same
 * pattern as MANUAL_SCOPE_ALLOWLIST.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");

const HR_ROUTE_FILES = [
  "employees.ts",
  "hr.ts",
  "hr-compliance.ts",
  "hr-contracts.ts",
  "hr-discipline.ts",
  "hr-exit.ts",
  "hr-loans.ts",
  "hr-overtime.ts",
  "hr-wps.ts",
  "recruitment.ts",
];

/**
 * (file, lineNumber) tuples for HR endpoints that are intentionally
 * registered without `authorize(...)` and the reason. Empty today —
 * everything must be gated. If you must add one, write the line
 * range as `"employees.ts:123"` and the justification.
 */
const INTENTIONAL_UNGATED = new Map<string, string>([
  // e.g. ["hr-wps.ts:456", "WPS regulator webhook — runs under shared-secret HMAC, no session"],
]);

interface RouteRegistration {
  file: string;
  line: number;
  method: string;
  path: string;
  hasAuthorize: boolean;
  snippet: string;
}

function scanFile(file: string): RouteRegistration[] {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");
  const out: RouteRegistration[] = [];
  // Match `router.X(` or `<name>Router.X(` — every HR router uses one
  // of these two patterns at the top of an endpoint declaration.
  const re = /\b([a-zA-Z]*[Rr]outer)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const before = src.slice(0, start);
    const line = before.split("\n").length;
    // Look ahead 240 chars after the registration head — enough for
    // both single-line `router.get("/x", authorize(...), handler)`
    // and a wrapped form across 3-4 lines. `authorize(` MUST appear
    // somewhere in that window.
    const window = src.slice(start, start + 240);
    out.push({
      file,
      line,
      method: m[2].toUpperCase(),
      path: m[4],
      hasAuthorize: /\bauthorize\s*\(/.test(window),
      snippet: src.slice(start, start + 80).replace(/\n.*$/s, "…"),
    });
  }
  return out;
}

const ALL_REGISTRATIONS: RouteRegistration[] = HR_ROUTE_FILES.flatMap(scanFile);

describe("HR-Wave-0 / 0.3 — every HR endpoint is gated by authorize()", () => {
  it("scans all 10 HR route files (no file silently dropped)", () => {
    // If someone deletes one of the HR routers (or renames it), the
    // ratchet shrinks — failing this pin makes the silent removal
    // visible at review time.
    const scannedFiles = new Set(ALL_REGISTRATIONS.map((r) => r.file));
    expect(scannedFiles.size).toBe(HR_ROUTE_FILES.length);
    for (const f of HR_ROUTE_FILES) {
      expect(scannedFiles.has(f), `expected to find at least one endpoint in ${f}`).toBe(true);
    }
  });

  it("every endpoint declaration has authorize() in the middleware chain", () => {
    const violations = ALL_REGISTRATIONS.filter(
      (r) => !r.hasAuthorize && !INTENTIONAL_UNGATED.has(`${r.file}:${r.line}`),
    ).map((r) => `${r.file}:${r.line} ${r.method} ${r.path} → "${r.snippet}"`);
    expect(
      violations,
      "HR endpoint is missing authorize() middleware. Either add the " +
        "gate (preferred) or add `<file>:<line>` to INTENTIONAL_UNGATED " +
        "with a written justification.",
    ).toEqual([]);
  });

  it("every entry in INTENTIONAL_UNGATED still corresponds to a real, ungated endpoint", () => {
    // Prevents the allowlist from rotting: if an entry's endpoint
    // gets either deleted OR newly-gated, the entry must be removed
    // (otherwise the allowlist accumulates dead exceptions that hide
    // future regressions).
    const stale: string[] = [];
    for (const key of INTENTIONAL_UNGATED.keys()) {
      const [file, lineStr] = key.split(":");
      const line = Number(lineStr);
      const hit = ALL_REGISTRATIONS.find((r) => r.file === file && r.line === line);
      if (!hit) {
        stale.push(`${key} (no endpoint at that location anymore — remove it)`);
        continue;
      }
      if (hit.hasAuthorize) {
        stale.push(`${key} (now gated by authorize — remove from allowlist)`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe("HR-Wave-0 / 0.3 — endpoint count pin (snapshot moves only with intent)", () => {
  it("registered HR endpoint count matches snapshot", () => {
    // The snapshot is informational: if it shifts in either direction
    // (route added or removed) the diff reviewer sees the change.
    // Adjust the expected number when the catalog moves on purpose.
    // PR-4 (#2077) added 2 endpoints to employees.ts (scoring/recompute
    // + scoring/history). PR-8 added 3 (lifecycle/*). PR-9 added 1
    // (GET /attendance/field-ping/eligibility on hr.ts; the /my/field
    // self-service mount lives outside the HR file set). All gated.
    // HR-REV-3 (#2222) added 1 (POST /employees/quick-activate, gated). 223→224.
    // HR-REV-8 (#2222) added 1 (POST /recruitment/applications/:id/hire, gated). 224→225.
    // HR-REV-9 (#2222) added 2 (PATCH+DELETE /hr/employee-documents/:id, gated). 225→227.
    // HR-REV-4 (#2222) added 1 (DELETE /employees/job-titles/:id, gated). 227→228.
    // الاستكمال الذاتي (الدفعة ب) أضاف 3 (GET /self-submissions + POST approve/reject
    // -self-data، كلها gated). 228→231. (مسارا /onboarding العامان في publicData
    // خارج مجموعة ملفات HR فلا يُحتسبان هنا.)
    // إعادة إرسال رابط الاستكمال (الدفعة هـ) أضاف 1 (POST /:id/resend-onboarding-link،
    // gated). 231→232.
    // البند ٣ (دفعة ١) أضاف 1 (POST /employees/:id/ocr-apply — عقد HR يطبّق مستخرَج OCR
    // على الموظف، gated بـhr.employees + ACL للصف + عزل companyId + تدقيق). 232→233.
    // معاينة المستحقّات قبل الترحيل أضافت 1 (GET /payroll/pending-dues — قراءة فقط،
    // gated بـhr.payroll.runs:view المُعاد، بلا دفتر). 233→234.
    expect(ALL_REGISTRATIONS.length).toBe(234);
  });

  it("authorize()-gated endpoint count matches snapshot (currently 100%)", () => {
    const gated = ALL_REGISTRATIONS.filter((r) => r.hasAuthorize).length;
    expect(gated).toBe(234);
  });

  it("per-file count pin (catches a router losing or gaining endpoints)", () => {
    const byFile: Record<string, number> = {};
    for (const r of ALL_REGISTRATIONS) byFile[r.file] = (byFile[r.file] ?? 0) + 1;
    expect(byFile).toEqual({
      // PR-4 (#2077) added 2 (scoring/recompute + scoring/history);
      // PR-8 (#2077) added 3 (lifecycle/status + /history + /transitions).
      // HR-REV-3 (#2222) added 1 (POST /quick-activate, gated). 18→19.
      // HR-REV-4 (#2222) added DELETE /job-titles/:id (gated). 19→20.
      // الاستكمال الذاتي (الدفعة ب) أضاف 3 (GET /self-submissions +
      // POST approve/reject-self-data، gated). 20→23.
      // الدفعة هـ أضافت POST /:id/resend-onboarding-link (gated). 23→24.
      // البند ٣ (دفعة ١) أضاف POST /:id/ocr-apply (عقد HR لتطبيق OCR، gated). 24→25.
      "employees.ts": 25,
      // main merged 4 endpoints (121→125); PR-9 (#2077) added the
      // field-ping eligibility mirror (125→126). HR-REV-9 (#2222) added
      // PATCH+DELETE /employee-documents/:id (126→128). All gated.
      // معاينة المستحقّات أضافت GET /payroll/pending-dues (قراءة فقط، gated). 128→129.
      "hr.ts": 129,
      "hr-compliance.ts": 3,
      "hr-contracts.ts": 12,
      "hr-discipline.ts": 24,
      "hr-exit.ts": 6,
      "hr-loans.ts": 6,
      "hr-overtime.ts": 7,
      "hr-wps.ts": 8,
      // HR-REV-8 (#2222) added POST /applications/:id/hire (gated). 13→14.
      "recruitment.ts": 14,
    });
  });
});
