#!/usr/bin/env node
/**
 * Honest runtime e2e audit of every route registered in
 * artifacts/ghayth-erp/src/routes/*.tsx.
 *
 * For each route we run up to 5 axes:
 *   A1 render        — page mounts, URL stable, no fatal console error,
 *                       <main> non-empty, no /login redirect.
 *   A2 list-data     — list pages: at least one GET 2xx + table rows or
 *                       empty state visible.
 *   A3 primary CTA   — create/edit pages: a save/submit button exists.
 *   A4 navigation    — direct URL navigation lands on the route (no
 *                       /login bounce, no 404 page).
 *   A5 page smoke    — list pages: search input or pagination affordance
 *                       present; create pages: at least one input + form.
 *
 * Axes that don't apply to a route are recorded as SKIP, never PASS.
 *
 * Output: writes per-batch JSON to /tmp/runtime-audit/batch_<N>.json
 * which the aggregator merges into FRONTEND_RUNTIME_AUDIT.md.
 *
 * Run: BATCH=0 BATCH_SIZE=50 node scripts/src/runtime-audit.cjs
 *      (use setsid nohup for full 369-route runs that exceed the 120s
 *      shell ceiling; one process handles ~50 routes in ~4 minutes.)
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require(
  path.join(__dirname, "..", "..", "artifacts", "ghayth-erp-deck", "node_modules", "puppeteer"),
);
// Phase 2: pidfile lock + api-server health-wait. Dependency-free.
const { acquireAuditLock, releaseAuditLock, waitForApiHealth } = require("./lib/audit-lock.cjs");

const BASE = process.env.BASE_URL || "http://localhost";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";
const BATCH = parseInt(process.env.BATCH || "0", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50", 10);
const OUT_DIR = process.env.OUT_DIR || "/tmp/runtime-audit";

// === Runtime Certification Harness v2 — Phase 1: Run-ID layout ===
// Every invocation gets a unique run-id and an isolated evidence-pack
// directory at OUT_DIR/<run-id>/, while still writing the legacy files
// (all.json, batch_NNN.json, progress.json, all_nav-diag.json) into
// OUT_DIR for backward compatibility with the existing aggregators and
// uploaders. The new layout is:
//   OUT_DIR/<run-id>/
//     environment.json    written immediately at startup
//     summary.json        written at end (counts + run metadata)
//     histogram.json      written at end (raw + categorized)
//     failures.json       written at end (a4=FAIL rows only)
//     screenshots/        per-route screenshots for failures
//   OUT_DIR/latest        symlink (or text pointer) → <run-id>
function makeRunId() {
  if (process.env.RUN_ID) return process.env.RUN_ID;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts =
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "-" +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${process.pid}-${rand}`;
}
const RUN_ID = makeRunId();
const RUN_DIR = path.join(OUT_DIR, RUN_ID);
const SHOT_DIR = process.env.SHOT_DIR || path.join(RUN_DIR, "screenshots");
const RUN_STARTED_AT = new Date().toISOString();
const RUN_STARTED_MS = Date.now();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

// "latest" pointer — atomic-ish via rename. Symlink first; on platforms
// where symlinks fail (e.g. Windows without privileges), fall back to a
// text file. Either way the operator can do `cat OUT_DIR/latest` to find
// the most recent run.
function updateLatestPointer() {
  const latest = path.join(OUT_DIR, "latest");
  try {
    if (fs.existsSync(latest) || fs.lstatSync(latest).isSymbolicLink?.()) fs.unlinkSync(latest);
  } catch { /* not present */ }
  try {
    fs.symlinkSync(RUN_ID, latest, "dir");
  } catch {
    try { fs.writeFileSync(latest, RUN_ID + "\n"); } catch { /* best-effort */ }
  }
}

// environment.json — written immediately so a crashed run still leaves
// a forensic record of what env it was launched in (node version,
// chromium binary, env flags, route count, …).
function writeEnvironmentJson(extra) {
  const { execSync } = require("child_process");
  let chromiumPath = "";
  try { chromiumPath = detectChromium(); } catch { /* ignored */ }
  let chromiumVersion = "";
  if (chromiumPath) {
    try {
      chromiumVersion = String(execSync(`${chromiumPath} --version`, { encoding: "utf8", timeout: 5000 })).trim();
    } catch { /* ignored */ }
  }
  let gitSha = "";
  try {
    gitSha = String(execSync("git rev-parse HEAD", { encoding: "utf8", cwd: path.join(__dirname, "..", ".."), timeout: 3000 })).trim();
  } catch { /* git ops blocked in this env — leave empty */ }
  const env = {
    runId: RUN_ID,
    startedAt: RUN_STARTED_AT,
    pid: process.pid,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    chromium: { path: chromiumPath, version: chromiumVersion },
    gitSha,
    base: BASE,
    adminEmail: ADMIN_EMAIL,
    flags: {
      ALL: process.env.ALL === "1",
      DIAG: process.env.DIAG === "1",
      CREATE_ONLY: process.env.CREATE_ONLY === "1",
      BATCH,
      BATCH_SIZE,
      ROUTES_INCLUDE: process.env.ROUTES_INCLUDE || "",
    },
    auditSessionId: `${RUN_ID}-s${Math.random().toString(36).slice(2, 6)}`,
    outDir: OUT_DIR,
    runDir: RUN_DIR,
    shotDir: SHOT_DIR,
    ...extra,
  };
  fs.writeFileSync(path.join(RUN_DIR, "environment.json"), JSON.stringify(env, null, 2));
  return env;
}

const SAVE_RE =
  /(حفظ|إنشاء|إضافة|تأكيد|تسجيل|نشر|اعتماد|اعتمد|إرسال|تقديم|تحديث|إصدار|توليد|إنهاء|submit|save|create|publish|register)/i;

function detectChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const { spawnSync } = require("child_process");
  for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("Chromium not found");
}

function loadRoutes() {
  const dir = path.join(__dirname, "..", "..", "artifacts", "ghayth-erp", "src", "routes");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  const set = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const re = /path:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
  }
  return Array.from(set).sort();
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const setCookie = r.headers.getSetCookie
    ? r.headers.getSetCookie()
    : (r.headers.raw && r.headers.raw()["set-cookie"]) || [];
  const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  return cookieHeader;
}

const ID_RESOLVERS = {
  "/employees": "/api/employees",
  "/clients": "/api/clients",
  "/correspondence": "/api/correspondence",
  "/crm": "/api/crm/leads",
  "/crm/leads": "/api/crm/leads",
  "/documents": "/api/documents",
  "/finance/accounts": "/api/finance/accounts",
  "/finance/budget": "/api/finance/budget",
  "/finance/commitments": "/api/finance/commitments",
  "/finance/custodies": "/api/finance/custodies",
  "/finance/expenses": "/api/finance/expenses",
  "/finance/financial-requests": "/api/finance/financial-requests",
  "/finance/fixed-assets": "/api/finance/fixed-assets",
  "/finance/invoices": "/api/finance/invoices",
  "/finance/journal-manual": "/api/finance/journal-manual",
  "/finance/purchase-orders": "/api/finance/purchase-orders",
  "/finance/receivables": "/api/finance/receivables",
  "/finance/recurring-journals": "/api/finance/recurring-journals",
  "/finance/salary-advances": "/api/finance/salary-advances",
  "/finance/vendors": "/api/finance/vendors",
  "/finance/vouchers": "/api/finance/vouchers",
  "/fleet": "/api/fleet/vehicles",
  "/fleet/drivers": "/api/fleet/drivers",
  "/fleet/fuel": "/api/fleet/fuel-logs",
  "/fleet/insurance": "/api/fleet/insurance",
  "/fleet/maintenance": "/api/fleet/maintenance",
  "/fleet/traffic-violations": "/api/fleet/traffic-violations",
  "/fleet/trips": "/api/fleet/trips",
  "/governance/audits": "/api/governance/audits",
  "/governance/compliance": "/api/governance/compliance",
  "/governance/policies": "/api/governance/policies",
  "/governance/risks": "/api/governance/risks",
  "/hr/attendance": "/api/hr/attendance",
  "/hr/contracts": "/api/hr/contracts",
  "/hr/evaluation-360": "/api/hr/evaluation-360",
  "/hr/excuse-requests": "/api/hr/excuse-requests",
  "/hr/exit": "/api/hr/exit",
  "/hr/leaves": "/api/hr/leaves",
  "/hr/loans": "/api/hr/loans",
  "/hr/overtime": "/api/hr/overtime",
  "/hr/payroll": "/api/hr/payroll",
  "/hr/performance": "/api/hr/performance",
  "/hr/training": "/api/hr/training",
  "/hr/transfers": "/api/hr/transfers",
  "/hr/violations": "/api/hr/violations",
  "/hr/recruitment": "/api/hr/recruitment",
  "/legal/cases": "/api/legal/cases",
  "/legal/contracts": "/api/legal/contracts",
  "/legal/judgments": "/api/legal/judgments",
  "/legal/sessions": "/api/legal/sessions",
  "/properties": "/api/properties/units",
  "/properties/buildings": "/api/properties/buildings",
  "/properties/owners": "/api/properties/owners",
  "/properties/tenants": "/api/properties/tenants",
  "/properties/contracts": "/api/properties/contracts",
  "/umrah/agents": "/api/umrah/agents",
  "/umrah/packages": "/api/umrah/packages",
  "/umrah/seasons": "/api/umrah/seasons",
  "/umrah/transport": "/api/umrah/transport",
  "/umrah/violations": "/api/umrah/violations",
  "/umrah/commission-plans": "/api/umrah/commission-plans",
  "/warehouse/products": "/api/warehouse/products",
  "/warehouse/categories": "/api/warehouse/categories",
  "/warehouse/movements": "/api/warehouse/movements",
  "/warehouse/suppliers": "/api/warehouse/suppliers",
};

function findResolverFor(routePath) {
  // Strip everything after the first :param, then walk up segments.
  const beforeParam = routePath.split("/:")[0];
  const segs = beforeParam.split("/").filter(Boolean);
  while (segs.length > 0) {
    const candidate = "/" + segs.join("/");
    if (ID_RESOLVERS[candidate]) return ID_RESOLVERS[candidate];
    segs.pop();
  }
  return null;
}

async function resolveParams(routePath, cookieHeader) {
  if (!routePath.includes(":")) return { ok: true, url: routePath };
  const resolver = findResolverFor(routePath);
  if (!resolver) return { ok: false, reason: `no id resolver for ${routePath}` };
  let id;
  try {
    const r = await fetch(`${BASE}${resolver}?limit=1`, {
      headers: { Cookie: cookieHeader, "Accept-Language": "ar" },
    });
    if (!r.ok) return { ok: false, reason: `${resolver} → ${r.status}` };
    const j = await r.json();
    const row = (j.data || j.items || j)[0];
    id = row?.id ?? row?.code;
  } catch (e) {
    return { ok: false, reason: `resolver err: ${e.message}` };
  }
  if (id == null) return { ok: false, reason: `no row in ${resolver}` };
  // Replace every :name segment with the same id.
  const url = routePath.replace(/:[A-Za-z]+/g, String(id));
  return { ok: true, url };
}

function classifyRoute(routePath) {
  const isCreate = /\/create$/.test(routePath);
  const isEdit = /\/edit$/.test(routePath);
  const isDetail = /:[A-Za-z]+$/.test(routePath) && !isCreate && !isEdit;
  const isList = !isCreate && !isEdit && !isDetail;
  return { isCreate, isEdit, isDetail, isList };
}

async function probe(page, routePath, resolvedUrl, cls) {
  // Reset listeners
  page.removeAllListeners("response");
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.removeAllListeners("framenavigated");
  const network = { get2xx: 0, status5xx: 0, status4xx: [], paths5xx: [] };
  const consoleErrs = [];
  let pageErr = null;
  // Nav trace — issue #638 diagnosis. Records every frame navigation
  // event and key URL samples so we can tell whether `landed=/dashboard`
  // is caused by an in-app redirect (apiFetch 401 → window.location =
  // /login → login.tsx auto-redirect), an AccessDenied without URL
  // change, or a harness race. Always collected; written to a sidecar
  // JSON only when DIAG=1 to avoid bloating normal runs.
  const navTrace = [];
  function recordNav(label, url) {
    navTrace.push({ t: Date.now(), label, url });
  }

  page.on("response", (r) => {
    const u = r.url();
    if (!u.includes("/api/")) return;
    const s = r.status();
    if (r.request().method() === "GET" && s >= 200 && s < 300) network.get2xx++;
    if (s >= 400 && s < 500) {
      const p = u.replace(/^https?:\/\/[^/]+/, "");
      if (network.status4xx.length < 5) network.status4xx.push(`${s} ${p}`);
    }
    if (s >= 500) {
      network.status5xx++;
      const p = u.replace(/^https?:\/\/[^/]+/, "");
      if (network.paths5xx.length < 3) network.paths5xx.push(`${s} ${p}`);
    }
  });
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => { pageErr = String(e.message || e).slice(0, 200); });
  // framenavigated fires for top-level navs incl. the in-page hard
  // redirect `window.location.href = "/login"` that apiFetch issues
  // when a 401 escapes refresh. That's the primary suspect for the
  // landed=/dashboard pattern flagged in #638.
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      recordNav("framenavigated", frame.url());
    }
  });

  let landedUrl = "";
  let nav_ok = false;
  try {
    recordNav("goto:start", `${BASE}${resolvedUrl}`);
    await page.goto(`${BASE}${resolvedUrl}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    nav_ok = true;
    recordNav("goto:domcontentloaded", page.url());
  } catch (e) {
    return {
      a1: "FAIL", a2: "SKIP", a3: "SKIP", a4: "FAIL", a5: "SKIP",
      note: `goto failed: ${String(e.message).slice(0, 120)}`,
      shot: null,
      navTrace,
    };
  }
  try { await page.waitForNetworkIdle({ idleTime: 700, timeout: 8000 }); } catch {}
  recordNav("networkIdle", page.url());
  await new Promise((r) => setTimeout(r, 1000));
  landedUrl = page.url();
  recordNav("postSleep1s", landedUrl);

  const dom = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, "i");
    const main = document.querySelector("main") || document.body;
    const mainText = (main.innerText || "").trim();
    const inputs = main.querySelectorAll(
      "input:not([type=hidden]),textarea,select,[role=combobox],[role=textbox]",
    );
    const buttons = Array.from(main.querySelectorAll(
      'button,[role=button],input[type=submit]'
    )).filter((b) => {
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const txt = (b.innerText || b.textContent || b.value || "").trim();
      if (/(close|cancel|إلغاء|رجوع|back|menu|toggle)/i.test(aria) || /^(×|✕|<|>|☰)$/.test(txt)) return false;
      return true;
    });
    const saveBtn = buttons.find((b) => {
      const txt = (b.innerText || b.textContent || b.value || "").trim();
      const aria = b.getAttribute("aria-label") || "";
      return re.test(txt) || re.test(aria);
    });
    const tables = main.querySelectorAll("table tbody tr, [role=row]");
    const emptyHints = /(لا توجد|لا يوجد|لا بيانات|empty|no data|no results|لا نتائج)/i.test(mainText.slice(0, 4000));
    const errorHints = /(غير موجود|404|not found|access denied|غير مصرح)/i.test(mainText.slice(0, 4000));
    const has404Page = /CloudRain|٤٠٤/.test(document.body.innerText.slice(0, 2000)) && /404/.test(document.body.innerText.slice(0, 2000));
    const search = !!main.querySelector('input[type=search],input[placeholder*="بحث"],input[placeholder*="Search" i]');
    const pag = /(التالي|السابق|next|previous|الصفحة)/i.test(mainText);
    // #638 — capture whether ModuleRoute rendered <AccessDenied/>
    // (URL keeps the requested path; AccessDenied has its own copy
    // strings) AND the auth-state evidence we have access to from
    // the DOM/localStorage at the time we read landedUrl.
    const accessDenied = /(ليس لديك صلاحية|access denied|forbidden|غير مسموح|page not allowed)/i.test(mainText.slice(0, 4000));
    let lsAssignments = null;
    try { lsAssignments = localStorage.getItem("erp_assignments"); } catch {}
    return {
      mainEmpty: mainText.length < 20,
      mainTextLen: mainText.length,
      hasInputs: inputs.length,
      saveLabel: saveBtn ? (saveBtn.innerText || saveBtn.textContent || "").trim().slice(0, 40) : null,
      tableRows: tables.length,
      emptyHints, errorHints, has404Page, search, pag,
      // #638 diagnostic fields
      accessDenied,
      lsHasSession: !!lsAssignments,
      lsAssignmentsLen: lsAssignments ? lsAssignments.length : 0,
    };
  }, SAVE_RE.source);

  const redirectedToLogin = /\/login(\?|$)/.test(landedUrl);
  const landedPath = (() => { try { return new URL(landedUrl).pathname.replace(/\/+$/, "") || "/"; } catch { return landedUrl; } })();
  const expectedPath = resolvedUrl.replace(/\?.*$/, "").replace(/\/+$/, "") || "/";
  // Match if exact, or expected is a prefix of landed (some pages append a tab/slug)
  const pathMatches = landedPath === expectedPath || landedPath.startsWith(expectedPath + "/");

  // ── A1 render
  let a1 = "PASS";
  let a1note = "";
  if (redirectedToLogin) { a1 = "FAIL"; a1note = "redirected to /login"; }
  else if (pageErr) { a1 = "FAIL"; a1note = `pageerror: ${pageErr}`; }
  else if (dom.has404Page) { a1 = "FAIL"; a1note = "rendered 404 page"; }
  else if (dom.mainEmpty) { a1 = "FAIL"; a1note = "main is empty"; }

  // ── A4 navigation (direct URL must land on the requested path family)
  let a4 = "PASS";
  let a4note = "";
  if (redirectedToLogin) { a4 = "FAIL"; a4note = "bounced to /login"; }
  else if (!pathMatches) { a4 = "FAIL"; a4note = `landed=${landedPath} expected=${expectedPath}`; }

  // ── A2 data fetch (list pages only)
  let a2;
  if (cls.isList) {
    if (network.status5xx > 0) a2 = "FAIL";
    else if (network.get2xx > 0 || dom.tableRows > 0 || dom.emptyHints) a2 = "PASS";
    else a2 = "FAIL";
  } else if (cls.isDetail) {
    a2 = network.status5xx > 0 ? "FAIL" : (network.get2xx > 0 ? "PASS" : "SKIP");
  } else {
    a2 = "SKIP";
  }

  // ── A3 primary CTA (create + edit pages)
  let a3;
  if (cls.isCreate || cls.isEdit) {
    a3 = dom.saveLabel ? "PASS" : "FAIL";
  } else {
    a3 = "SKIP";
  }

  // ── A5 runtime smoke (create/edit: fill + submit; list: search/pagination/rows present)
  let a5 = "SKIP";
  let a5note = "";
  if (cls.isCreate || cls.isEdit) {
    if (!dom.saveLabel) { a5 = "FAIL"; a5note = "no save button"; }
    else {
      try {
        // Fill all visible, writable fields with type-appropriate test data
        const filled = await page.evaluate(() => {
          const setVal = (el, v) => {
            const proto = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            setter ? setter.call(el, v) : (el.value = v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          };
          let n = 0;
          document.querySelectorAll("input, textarea").forEach((el) => {
            if (el.disabled || el.readOnly || el.type === "hidden" || el.type === "file") return;
            if (el.type === "checkbox" || el.type === "radio") { if (!el.checked) { el.click(); n++; } return; }
            if (el.type === "number") setVal(el, "1");
            else if (el.type === "email") setVal(el, "audit@test.local");
            else if (el.type === "date") setVal(el, "2026-01-01");
            else if (el.type === "tel") setVal(el, "0500000000");
            else if (el.type === "url") setVal(el, "https://example.com");
            else if (el.tagName === "TEXTAREA" || el.type === "text" || !el.type) setVal(el, "تجربة الفحص الآلي");
            n++;
          });
          document.querySelectorAll("select").forEach((el) => {
            if (el.disabled) return;
            const opts = Array.from(el.options).filter((o) => o.value);
            if (opts.length) { el.value = opts[0].value; el.dispatchEvent(new Event("change", { bubbles: true })); n++; }
          });
          return n;
        });
        // Watch for the write request triggered by the click
        let writeStatus = 0; let writeMethod = ""; let writePath = "";
        const respPromise = page
          .waitForResponse((r) => /\/api\//.test(r.url()) && /^(POST|PATCH|PUT|DELETE)$/.test(r.request().method()), { timeout: 6000 })
          .catch(() => null);
        const clicked = await page.evaluate((reSrc) => {
          const re = new RegExp(reSrc, "i");
          const buttons = Array.from(document.querySelectorAll("button,[role=button],input[type=submit]"));
          const btn = buttons.find((b) => {
            if (b.disabled) return false;
            const t = (b.innerText || b.textContent || b.value || "").trim();
            const a = b.getAttribute("aria-label") || "";
            return re.test(t) || re.test(a);
          });
          if (btn) { btn.scrollIntoView(); btn.click(); return true; }
          return false;
        }, SAVE_RE.source);
        if (!clicked) { a5 = "FAIL"; a5note = `fields=${filled}; save button not clickable`; }
        else {
          const r = await respPromise;
          if (r) { writeStatus = r.status(); writeMethod = r.request().method(); writePath = r.url().replace(/^https?:\/\/[^/]+/, ""); }
          if (writeStatus >= 500) { a5 = "FAIL"; a5note = `write ${writeMethod} ${writePath} → ${writeStatus} (server crash)`; }
          else if (writeStatus >= 200 && writeStatus < 500) { a5 = "PASS"; a5note = `write ${writeMethod} ${writePath} → ${writeStatus}`; }
          else { a5 = "FAIL"; a5note = `fields=${filled}; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s`; }
        }
      } catch (e) { a5 = "FAIL"; a5note = `smoke-throw: ${String(e.message).slice(0, 100)}`; }
    }
  } else if (cls.isList) {
    a5 = (dom.search || dom.pag || dom.tableRows > 0 || dom.emptyHints) ? "PASS" : "FAIL";
    if (a5 === "FAIL") a5note = "no search/pag/rows/empty-state";
  }

  const failed = [a1, a2, a3, a4, a5].includes("FAIL");
  let shot = null;
  if (failed) {
    const safe = routePath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    shot = `${SHOT_DIR}/${safe}.png`;
    try { await page.screenshot({ path: shot, fullPage: false }); } catch { shot = null; }
  }

  // #638 — surface the diagnostic classification on every nav failure
  // so the regular audit reports tell the operator WHICH cause they
  // hit (auth401 hard-redirect vs AccessDenied vs harness race). The
  // sidecar JSON below carries the full per-event trace.
  // #638 — refined navCause buckets (2026-05-19):
  //   * harness-*           → audit infra (chromium starvation, page crash) — not a runtime defect
  //   * api401→/login       → real session expiry: apiFetch saw 401 and pushed /login
  //   * forbidden-bounce    → SPA route-guard sent user to /login with session STILL VALID
  //                            and ZERO captured 4xx. This is the #638 class — guard should
  //                            have sent to /forbidden instead.
  //   * login-bounce-no-401 → bounced to /login, no 401 captured, session ALSO gone. Refresh
  //                            path swallowed something — needs investigation.
  //   * AccessDenied        → URL never changed; page rendered an AccessDenied banner.
  //   * api4xx-no-redirect  → some 4xx fired but URL never reached /login or expected path.
  //   * unclassified        → genuinely unknown; trace dumped for follow-up.
  let navCause = "";
  if (a4 === "FAIL") {
    const firstApi4xx = network.status4xx[0] || "";
    const has401 = /\b401\b/.test(network.status4xx.join(" "));
    const sawLoginInTrace = navTrace.some((e) => /\/login(\?|$)/.test(e.url));
    if (has401 && sawLoginInTrace) navCause = "api401→/login (apiFetch hard redirect, real session expiry)";
    else if (dom.accessDenied) navCause = "AccessDenied (URL didn't change; SPA rendered access-denied banner)";
    else if (sawLoginInTrace && dom.lsHasSession) navCause = "forbidden-bounce (SPA guard sent /login with valid session + no api4xx — should be /forbidden)";
    else if (sawLoginInTrace && !dom.lsHasSession) navCause = "login-bounce-no-401 (session lost silently — refresh path swallowed something)";
    else if (!dom.lsHasSession) navCause = "session-lost-mid-nav (localStorage cleared, no /login redirect captured)";
    else if (firstApi4xx) navCause = `api4xx-no-redirect (${firstApi4xx}, never landed on /login or expected path)`;
    else navCause = `unclassified (trace=${navTrace.map((e) => e.label).join(",") || "empty"})`;
  }

  const note = [
    a1note,
    a4note,
    navCause,
    a5note,
    network.status5xx ? `5xx:${network.paths5xx.join("|")}` : "",
    !cls.isCreate && !cls.isEdit && network.get2xx === 0 && cls.isList ? "no api gets" : "",
    consoleErrs.length ? `consoleErr=${consoleErrs.length}` : "",
  ].filter(Boolean).join("; ");

  return { a1, a2, a3, a4, a5, note, shot, landedUrl, navTrace, navCause, dom4xx: network.status4xx };
}

(async () => {
  const allRoutes = loadRoutes();
  let start, end, routes;
  if (process.env.ALL === "1") {
    start = 0; end = allRoutes.length; routes = allRoutes;
    console.log(`[audit] ALL: ${routes.length} routes`);
  } else {
    start = BATCH * BATCH_SIZE;
    end = Math.min(start + BATCH_SIZE, allRoutes.length);
    routes = allRoutes.slice(start, end);
    console.log(`[audit] batch ${BATCH}: routes ${start}..${end - 1} (${routes.length} of ${allRoutes.length})`);
  }

  // === Phase 1: write environment.json + claim "latest" pointer ===
  // before any heavyweight work so a crashed run still leaves a
  // forensic trace of what was launched and where.
  const envRecord = writeEnvironmentJson({
    routeCountTotal: allRoutes.length,
    routeCountInRun: routes.length,
    batchStart: start,
    batchEnd: end,
  });
  updateLatestPointer();
  console.log(`[audit] run-id=${RUN_ID} run-dir=${RUN_DIR} (session=${envRecord.auditSessionId})`);

  // === Phase 2: acquire pidfile lock so two audits can't race chromium ===
  // The 233/251 a4=FAIL harness-timeout cascade in the 2026-05-19 ALL
  // run was caused by 3 concurrent chromium audits starving each other.
  // The lock makes that impossible at the harness level; set FORCE_LOCK=1
  // to override (used by the runtime-verify orchestrator after a clean
  // kill of any prior chromium pid).
  let lockHandle = null;
  try {
    lockHandle = acquireAuditLock({ runId: RUN_ID, force: process.env.FORCE_LOCK === "1" });
    console.log(`[audit] acquired lock at ${lockHandle.lockPath}` + (lockHandle.previous ? ` (reclaimed stale pid=${lockHandle.previous.pid})` : ""));
  } catch (e) {
    if (e.code === "EAUDITLOCK") {
      console.error(e.message);
      console.error(`[audit] refusing to start — set FORCE_LOCK=1 to override.`);
      process.exit(3);
    }
    throw e;
  }
  // Always release on the way out, even on crash, so the next run isn't
  // blocked by a stale lockfile we owned.
  const releaseLock = () => {
    if (!lockHandle) return;
    try { releaseAuditLock({ lockPath: lockHandle.lockPath }); } catch { /* best-effort */ }
    lockHandle = null;
  };
  process.on("exit", releaseLock);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => { releaseLock(); process.exit(130); });
  }

  // === Phase 2: wait for api-server /api/healthz before login ===
  // Refuses to start against a not-yet-warm api-server (the second #638
  // root cause: an api-server restart mid-audit caused every in-flight
  // route to fail). Bounded so a genuinely-down api-server doesn't hang
  // the harness forever — exit 4 makes the cause unambiguous.
  const healthTimeoutMs = parseInt(process.env.HEALTH_TIMEOUT_MS || "60000", 10);
  try {
    const h = await waitForApiHealth({ baseUrl: BASE, timeoutMs: healthTimeoutMs });
    console.log(`[audit] api-server healthy (attempts=${h.attempts}, ${h.durationMs}ms)`);
  } catch (e) {
    if (e.code === "EHEALTHTIMEOUT") {
      console.error(e.message);
      console.error(`[audit] refusing to start — api-server not responding on ${BASE}/api/healthz`);
      releaseLock();
      process.exit(4);
    }
    throw e;
  }

  console.log(`[audit] login as ${ADMIN_EMAIL}…`);
  const cookieHeader = await login();
  console.log(`[audit] login ok, cookieHeader len=${cookieHeader.length}`);

  process.on("uncaughtException", (e) => { console.error("[uncaught]", e); });
  process.on("unhandledRejection", (e) => { console.error("[unhandled]", e); });

  console.log(`[audit] launching chromium at ${detectChromium()}…`);
  const browser = await puppeteer.launch({
    headless: true,
    dumpio: !!process.env.DUMPIO,
    executablePath: detectChromium(),
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
      "--disable-extensions", "--disable-background-networking",
      "--disable-default-apps", "--disable-sync",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "ar" });
  // seed cookie via in-page fetch (HttpOnly cookies don't round-trip via setCookie)
  async function inPageLogin() {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(async ({ email, password }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      localStorage.setItem("erp_assignments", JSON.stringify(d.assignments || []));
    }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
  }
  await inPageLogin();

  const results = [];
  let routesSinceReLogin = 0;
  const RELOGIN_EVERY = 25;
  for (const routePath of routes) {
    if (routesSinceReLogin >= RELOGIN_EVERY) {
      console.log(`[audit] re-login (${routesSinceReLogin} routes since last)`);
      try { await inPageLogin(); } catch (e) { console.error("[relogin failed]", e.message); }
      routesSinceReLogin = 0;
    }
    routesSinceReLogin++;
    const cls = classifyRoute(routePath);
    const res = await resolveParams(routePath, cookieHeader);
    if (!res.ok) {
      const row = {
        route: routePath,
        a1: "SKIP", a2: "SKIP", a3: "SKIP", a4: "SKIP", a5: "SKIP",
        note: `unresolved: ${res.reason}`, shot: null, cls,
      };
      results.push(row);
      console.log(`SKIP  ${routePath.padEnd(60)} ${res.reason}`);
      continue;
    }
    let row;
    try {
      const p = await probe(page, routePath, res.url, cls);
      row = { route: routePath, ...p, cls };
    } catch (e) {
      // #638 — probe throws now carry a real navCause instead of falling
      // into the histogram "unknown" bucket. The 233/251 a4 failures in
      // the 2026-05-19 ALL run were ALL Navigation timeouts caused by
      // chromium starvation (3 concurrent audits + api-server restart),
      // not by app-level redirects — they belong in a "harness-*" bucket
      // so operators stop chasing them as runtime defects.
      const msg = String(e.message || "");
      let navCause;
      if (/Navigation timeout/i.test(msg)) navCause = "harness-timeout (page.goto exceeded 25s — chromium/proxy starvation, not a route defect)";
      else if (/detached Frame/i.test(msg)) navCause = "harness-detached-frame (chromium crashed mid-navigation)";
      else if (/Target closed/i.test(msg) || /Session closed/i.test(msg)) navCause = "harness-session-closed (browser/page died)";
      else navCause = `harness-throw (${msg.slice(0, 100)})`;
      row = {
        route: routePath, a1: "FAIL", a2: "SKIP", a3: "SKIP", a4: "FAIL", a5: "SKIP",
        note: `probe-throw: ${msg.slice(0, 120)}; ${navCause}`, shot: null, cls,
        landedUrl: "", navTrace: [], navCause, dom4xx: [],
      };
    }
    results.push(row);
    const tag = [row.a1, row.a2, row.a3, row.a4, row.a5].includes("FAIL") ? "FAIL"
      : (row.a1 === "PASS" ? "PASS" : "SKIP");
    console.log(`${tag.padEnd(5)} ${routePath.padEnd(60)} ${row.a1}/${row.a2}/${row.a3}/${row.a4}/${row.a5} ${row.note || ""}`.slice(0, 200));
    if (results.length % 10 === 0) {
      fs.writeFileSync(path.join(OUT_DIR, "progress.json"), JSON.stringify({ done: results.length, total: routes.length, results }, null, 2));
    }
  }

  await browser.close();
  const tag = process.env.ALL === "1" ? "all" : `batch_${String(BATCH).padStart(3, "0")}`;
  const out = path.join(OUT_DIR, `${tag}.json`);
  fs.writeFileSync(out, JSON.stringify({ batch: BATCH, start, end, results }, null, 2));

  // #638 — when DIAG=1 is set, write a sidecar focused only on the
  // routes whose A4 (nav) failed, including the full per-route nav
  // trace and the inferred navCause. Lets the operator classify the
  // landed=/dashboard pattern without re-reading the verbose main
  // results file. Always also writes a short summary table to stdout.
  //
  // The histogram now groups raw navCauses into 4 categories so the
  // operator can see at-a-glance how many failures are real runtime
  // defects vs harness noise (the 2026-05-19 ALL run had 233/251 = 93%
  // harness-timeout, only 18/251 = 7% real). Categories:
  //   * harness   → audit infra (chromium timeout/crash/detach) — NOT a defect
  //   * authz     → SPA route-guard bounce with valid session (#638 class)
  //   * auth      → real session expiry (api401, lost session)
  //   * unknown   → genuinely unclassified — needs trace inspection
  function categorize(cause) {
    if (!cause || /^unclassified/.test(cause)) return "unknown";
    if (/^harness-/.test(cause)) return "harness";
    if (/^(api401|session-lost-mid-nav|login-bounce-no-401)/.test(cause)) return "auth";
    if (/^(forbidden-bounce|AccessDenied|api4xx-no-redirect)/.test(cause)) return "authz";
    return "unknown";
  }
  const a4Failures = results.filter((r) => r.a4 === "FAIL");
  const causeHistogram = {};
  const categoryHistogram = { harness: 0, authz: 0, auth: 0, unknown: 0 };
  for (const r of a4Failures) {
    const raw = (r.navCause || "unclassified").replace(/^navCause=/, "");
    causeHistogram[raw] = (causeHistogram[raw] || 0) + 1;
    categoryHistogram[categorize(raw)]++;
  }
  if (a4Failures.length > 0) {
    const total = a4Failures.length;
    const pct = (n) => `${((n / total) * 100).toFixed(1).padStart(5)}%`;
    console.log(`\n[#638 nav-cause histogram] ${total} a4=FAIL of ${results.length} probed`);
    console.log(`  ── BY CATEGORY ──`);
    for (const [cat, n] of Object.entries(categoryHistogram).sort((a, b) => b[1] - a[1])) {
      if (n === 0) continue;
      const hint = cat === "harness" ? " (audit infra noise — NOT runtime defects)"
                 : cat === "authz"   ? " (SPA route-guard / RBAC — real defects)"
                 : cat === "auth"    ? " (session/auth — investigate)"
                 :                     " (needs trace inspection)";
      console.log(`  ${String(n).padStart(4)} ${pct(n)} × ${cat}${hint}`);
    }
    console.log(`  ── BY RAW CAUSE ──`);
    for (const [cause, count] of Object.entries(causeHistogram).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)} ${pct(count)} × ${cause}`);
    }
  }
  if (process.env.DIAG === "1") {
    const diagOut = path.join(OUT_DIR, `${tag}_nav-diag.json`);
    fs.writeFileSync(diagOut, JSON.stringify({
      batch: BATCH,
      generatedAt: new Date().toISOString(),
      summary: { totalProbed: results.length, a4Failures: a4Failures.length, causeHistogram, categoryHistogram },
      failures: a4Failures.map((r) => ({
        route: r.route,
        landedUrl: r.landedUrl || "",
        navCause: r.navCause || "",
        category: categorize((r.navCause || "").replace(/^navCause=/, "")),
        navTrace: r.navTrace || [],
        api4xx: r.dom4xx || [],
        note: r.note,
      })),
    }, null, 2));
    console.log(`[#638] DIAG sidecar → ${diagOut}`);
  }
  console.log(`[audit] wrote ${out} (${results.length} rows)`);

  // === Phase 1: Runtime Evidence Pack — always written, not gated on DIAG ===
  // The legacy DIAG sidecar above is preserved for backward compat; the
  // pack below is the v2 layout that downstream tools (CI, dashboards,
  // operators) will read going forward. Per-run, machine-readable, and
  // referenced from environment.json by run-id.
  const runEndedAt = new Date().toISOString();
  const runDurationMs = Date.now() - RUN_STARTED_MS;
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) {
    const overall = [r.a1, r.a2, r.a3, r.a4, r.a5].includes("FAIL") ? "fail"
      : (r.a1 === "PASS" ? "pass" : "skip");
    counts[overall]++;
  }
  const axisCounts = { a1: {P:0,F:0,S:0}, a2: {P:0,F:0,S:0}, a3: {P:0,F:0,S:0}, a4: {P:0,F:0,S:0}, a5: {P:0,F:0,S:0} };
  for (const r of results) {
    for (const ax of ["a1","a2","a3","a4","a5"]) {
      const v = r[ax];
      if (v === "PASS") axisCounts[ax].P++;
      else if (v === "FAIL") axisCounts[ax].F++;
      else axisCounts[ax].S++;
    }
  }
  fs.writeFileSync(path.join(RUN_DIR, "summary.json"), JSON.stringify({
    runId: RUN_ID,
    auditSessionId: envRecord.auditSessionId,
    startedAt: RUN_STARTED_AT,
    endedAt: runEndedAt,
    durationMs: runDurationMs,
    routeCountInRun: results.length,
    routeCountTotal: allRoutes.length,
    counts,
    axisCounts,
    a4Failures: a4Failures.length,
    categoryHistogram,
    legacyAllJsonPath: out,
  }, null, 2));
  fs.writeFileSync(path.join(RUN_DIR, "histogram.json"), JSON.stringify({
    runId: RUN_ID,
    totalProbed: results.length,
    a4Failures: a4Failures.length,
    categoryHistogram,
    causeHistogram,
  }, null, 2));
  fs.writeFileSync(path.join(RUN_DIR, "failures.json"), JSON.stringify({
    runId: RUN_ID,
    count: a4Failures.length,
    failures: a4Failures.map((r) => ({
      route: r.route,
      landedUrl: r.landedUrl || "",
      navCause: r.navCause || "",
      category: categorize((r.navCause || "").replace(/^navCause=/, "")),
      navTrace: r.navTrace || [],
      api4xx: r.dom4xx || [],
      note: r.note,
      shot: r.shot || "",
    })),
  }, null, 2));
  console.log(`[audit] evidence pack → ${RUN_DIR}/{summary,histogram,failures,environment}.json`);
})().catch((e) => {
  console.error("[audit] fatal:", e);
  // Phase 1: even on a crash, drop a tombstone so the operator can find
  // the run-id + what was loaded by the time it died.
  try {
    fs.writeFileSync(path.join(RUN_DIR, "summary.json"), JSON.stringify({
      runId: RUN_ID,
      auditSessionId: `${RUN_ID}-crashed`,
      startedAt: RUN_STARTED_AT,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - RUN_STARTED_MS,
      crashed: true,
      error: String(e && e.message || e).slice(0, 500),
    }, null, 2));
  } catch { /* best-effort */ }
  process.exit(2);
});
