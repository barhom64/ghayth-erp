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
// Phase 6: machine-readable navCause taxonomy. Closed enum + metadata.
const navTaxonomy = require("./lib/nav-cause-taxonomy.cjs");

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
      // Phase 1 experimental knobs — operator overrides for the
      // triangulation matrix (Phase 2 of Runtime Stabilization).
      REVERSE_ORDER: process.env.REVERSE_ORDER === "1",
      BROWSER_RECYCLE_EVERY: parseInt(process.env.BROWSER_RECYCLE_EVERY || "0", 10),
      SAMPLE_EVERY_N_ROUTES: parseInt(process.env.SAMPLE_EVERY_N_ROUTES || "10", 10),
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
  // Runtime Stabilization Program — Phase 1 experimental knobs.
  // Both default OFF: real runs don't change behaviour. The operator
  // flips them to triangulate the cause of a regression:
  //   REVERSE_ORDER=1            walk the route set in reverse → tests
  //                              whether failures track route POSITION
  //                              (chromium starvation, late-batch GC) vs
  //                              route IDENTITY (app regression).
  //   BROWSER_RECYCLE_EVERY=25   close + re-open the puppeteer Page every
  //                              N routes → tests whether failures track
  //                              accumulated DOM listeners, modal residue,
  //                              or page-level memory creep. Drops the
  //                              cache (each new page starts cold).
  //                              Default 0 = disabled (current behaviour).
  if (process.env.REVERSE_ORDER === "1") {
    routes = routes.slice().reverse();
    console.log(`[audit] REVERSE_ORDER=1 — walking ${routes.length} routes in reverse`);
  }
  const BROWSER_RECYCLE_EVERY = parseInt(process.env.BROWSER_RECYCLE_EVERY || "0", 10);
  if (BROWSER_RECYCLE_EVERY > 0) {
    console.log(`[audit] BROWSER_RECYCLE_EVERY=${BROWSER_RECYCLE_EVERY} — recycling Page every ${BROWSER_RECYCLE_EVERY} routes`);
  }
  let pageRecycleCount = 0;

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

  console.log(`[audit] login as ${ADMIN_EMAIL}…`);
  const cookieHeader = await login();
  console.log(`[audit] login ok, cookieHeader len=${cookieHeader.length}`);

  process.on("uncaughtException", (e) => { console.error("[uncaught]", e); });
  process.on("unhandledRejection", (e) => { console.error("[unhandled]", e); });

  console.log(`[audit] launching chromium at ${detectChromium()}…`);
  // === Phase 3: browser+page mutable so we can relaunch after a crash ===
  // The harness-detached-frame / harness-session-closed buckets in
  // #638's histogram represent chromium dying mid-run. Before Phase 3
  // every route after the crash also failed. Now we relaunch and
  // continue, with the per-route retry loop deciding whether to re-probe.
  let browser = null;
  let page = null;
  const chromiumLaunchArgs = {
    headless: true,
    dumpio: !!process.env.DUMPIO,
    executablePath: detectChromium(),
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
      "--disable-extensions", "--disable-background-networking",
      "--disable-default-apps", "--disable-sync",
    ],
  };
  let chromiumCrashCount = 0;
  let reloginCount = 0;
  // Phase 4 (api-server restart awareness) — apiRestartCount declaration
  // was lost when PR #675's diff merged empty. Detection is now real:
  // sampleRuntimeMetrics() polls /healthz periodically and increments
  // this counter on every false→true health transition.
  let apiRestartCount = 0;

  // === Runtime Stabilization — Phase 1 instrumentation ===
  //
  // Periodic samples of memory / fd / browser-context / api-health while
  // the audit walks routes. Three things this enables:
  //
  //   1. Distinguishing harness-side regressions (memory/fd creep,
  //      runaway browser pages) from app-side regressions (route
  //      timeouts, auth loops) — both look identical in the per-route
  //      log without these counters.
  //   2. Real api-server restart awareness (Phase 4 completion):
  //      apiRestartCount increments on every false→true health
  //      transition. Static-zero behaviour from the previous PR is now
  //      replaced with actual data.
  //   3. A first-failure index so the operator can bisect across runs
  //      without re-reading the full per-route table.
  //
  // Samples are bounded — once every SAMPLE_EVERY_N_ROUTES (default
  // every 10 routes) plus one snapshot at boot and one at shutdown.
  // Output: instrumentation.json next to summary.json + timings.json.
  const SAMPLE_EVERY_N_ROUTES = parseInt(process.env.SAMPLE_EVERY_N_ROUTES || "10", 10);
  const HEALTH_TIMEOUT_MS = parseInt(process.env.SAMPLE_HEALTH_TIMEOUT_MS || "5000", 10);
  let firstFailureIdx = -1;
  let firstFailureRoute = null;
  let lastHealthOk = null;
  const instrumentationSamples = [];

  function getFdCount() {
    // /proc/self/fd is Linux/macOS specific; quietly null on other platforms.
    try {
      return fs.readdirSync("/proc/self/fd").length;
    } catch {
      return null;
    }
  }

  async function checkApiHealth() {
    const t0 = Date.now();
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), HEALTH_TIMEOUT_MS);
      const r = await fetch(`${BASE}/api/healthz`, { signal: ac.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      const ok = r.ok;
      if (lastHealthOk === false && ok) {
        apiRestartCount++;
        console.warn(`[audit] api-server restart detected (#${apiRestartCount}) — health restored after downtime`);
      }
      lastHealthOk = ok;
      return { ok, latencyMs, status: r.status };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      if (lastHealthOk !== false) {
        console.warn(`[audit] api-server health failure: ${String(e && e.message || e).slice(0, 100)}`);
      }
      lastHealthOk = false;
      return { ok: false, latencyMs, error: String(e && e.message || e).slice(0, 100) };
    }
  }

  // Frontend latency — separate from /api/healthz so we can distinguish
  // "api-server fine, vite/static dying" from "everything fine". Fetches
  // BASE/ (the index.html that vite serves in dev or the static build
  // serves in preview). Treats any 200..399 as ok, since some setups
  // redirect / to /login.
  async function checkFrontendLatency() {
    const t0 = Date.now();
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), HEALTH_TIMEOUT_MS);
      const r = await fetch(`${BASE}/`, { signal: ac.signal, redirect: "manual" });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      const ok = r.status >= 200 && r.status < 400;
      return { ok, latencyMs, status: r.status };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      return { ok: false, latencyMs, error: String(e && e.message || e).slice(0, 100) };
    }
  }

  async function sampleRuntimeMetrics(label, routeIdx) {
    const mem = process.memoryUsage();
    const sample = {
      label,
      atMs: Date.now() - RUN_STARTED_MS,
      routeIdx,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      fd: getFdCount(),
      browser: { contextCount: 0, pageCount: 0 },
      health: null,
    };
    // Browser snapshot can throw if the browser is mid-relaunch; treat
    // as zero rather than killing the sample.
    try {
      if (browser) {
        const ctxs = browser.browserContexts();
        sample.browser.contextCount = ctxs.length;
        let total = 0;
        for (const c of ctxs) total += (await c.pages()).length;
        sample.browser.pageCount = total;
      }
    } catch { /* browser dead — leave zeros */ }
    sample.health = await checkApiHealth();
    sample.frontend = await checkFrontendLatency();
    instrumentationSamples.push(sample);
    return sample;
  }
  async function launchChromium() {
    browser = await puppeteer.launch(chromiumLaunchArgs);
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "ar" });
  }
  await launchChromium();
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
    reloginCount++;
  }
  await inPageLogin();

  // === Phase 3: per-route retry strategy (harness-only) ===
  // Classifies a probe-throw into the canonical navCause buckets and
  // declares whether it is retry-eligible. We ONLY retry harness causes
  // (chromium starvation / crash / detach). Real-defect causes (auth401,
  // forbidden-bounce, AccessDenied, …) are recorded on first hit so we
  // don't mask flaky-defects-look-fine-after-retry.
  const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS || "3", 10);
  const RETRY_BACKOFF_MS = parseInt(process.env.RETRY_BACKOFF_MS || "1500", 10);
  function classifyProbeThrow(msg) {
    if (/Navigation timeout/i.test(msg)) return { navCause: "harness-timeout (page.goto exceeded 25s — chromium/proxy starvation, not a route defect)", relaunch: false };
    if (/detached Frame/i.test(msg)) return { navCause: "harness-detached-frame (chromium crashed mid-navigation)", relaunch: true };
    if (/Target closed/i.test(msg) || /Session closed/i.test(msg)) return { navCause: "harness-session-closed (browser/page died)", relaunch: true };
    if (/Protocol error/i.test(msg)) return { navCause: `harness-protocol-error (${msg.slice(0, 80)})`, relaunch: true };
    return { navCause: `harness-throw (${msg.slice(0, 100)})`, relaunch: false };
  }
  async function relaunchChromium(reason) {
    chromiumCrashCount++;
    console.warn(`[audit] relaunching chromium (#${chromiumCrashCount}) due to: ${reason}`);
    try { if (browser) await browser.close(); } catch { /* already dead */ }
    await launchChromium();
    try { await inPageLogin(); } catch (e) { console.error("[audit] relogin after relaunch failed:", e.message); }
  }

  const results = [];
  let routesSinceReLogin = 0;
  const RELOGIN_EVERY = 25;
  // Phase 1 instrumentation: boot baseline so post-shutdown diffs are
  // meaningful (memory growth, fd creep, browser-page accumulation).
  await sampleRuntimeMetrics("boot", -1);
  for (let routeIdx = 0; routeIdx < routes.length; routeIdx++) {
    const routePath = routes[routeIdx];
    if (routesSinceReLogin >= RELOGIN_EVERY) {
      console.log(`[audit] re-login (${routesSinceReLogin} routes since last)`);
      try { await inPageLogin(); } catch (e) { console.error("[relogin failed]", e.message); }
      routesSinceReLogin = 0;
    }
    routesSinceReLogin++;
    // Periodic sample so the operator can correlate slowdown / crash
    // with memory / fd / browser-page growth. Cheap (≈ 1 syscall + 1
    // HTTP HEAD-equivalent) so we can afford every-10-routes by default.
    if (routeIdx > 0 && routeIdx % SAMPLE_EVERY_N_ROUTES === 0) {
      await sampleRuntimeMetrics(`tick:${routeIdx}`, routeIdx);
    }
    // Experimental knob: close + re-open the puppeteer Page every N
    // routes to test the "DOM / listener / cache residue" hypothesis.
    // Default OFF (BROWSER_RECYCLE_EVERY=0). The Page is recreated on
    // the same browser instance — no relaunch overhead — but cookies
    // are preserved by the browser context, so re-login isn't needed.
    if (BROWSER_RECYCLE_EVERY > 0 && routeIdx > 0 && routeIdx % BROWSER_RECYCLE_EVERY === 0) {
      try {
        await page.close({ runBeforeUnload: false });
      } catch (e) {
        console.warn(`[audit] page.close at recycle failed (continuing): ${String(e && e.message || e).slice(0, 80)}`);
      }
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setExtraHTTPHeaders({ "Accept-Language": "ar" });
        pageRecycleCount++;
        console.log(`[audit] page recycled (#${pageRecycleCount}) at routeIdx=${routeIdx}`);
      } catch (e) {
        console.error(`[audit] page recycle FAILED — relaunching chromium: ${String(e && e.message || e)}`);
        await relaunchChromium("page-recycle-failed");
      }
    }
    const cls = classifyRoute(routePath);
    const res = await resolveParams(routePath, cookieHeader);
    if (!res.ok) {
      const row = {
        route: routePath,
        a1: "SKIP", a2: "SKIP", a3: "SKIP", a4: "SKIP", a5: "SKIP",
        note: `unresolved: ${res.reason}`, shot: null, cls, retries: 0,
      };
      results.push(row);
      console.log(`SKIP  ${routePath.padEnd(60)} ${res.reason}`);
      continue;
    }
    // === Phase 3: retry loop — harness causes only ===
    // === Phase 5: wall-clock timing around the full probe (incl. retries) ===
    const probeT0 = Date.now();
    let row = null;
    let attempts = 0;
    let lastThrowMsg = "";
    let lastHarnessCause = "";
    while (attempts < RETRY_MAX_ATTEMPTS) {
      attempts++;
      try {
        const p = await probe(page, routePath, res.url, cls);
        row = { route: routePath, ...p, cls, retries: attempts - 1 };
        break;
      } catch (e) {
        lastThrowMsg = String(e.message || "");
        const { navCause, relaunch } = classifyProbeThrow(lastThrowMsg);
        lastHarnessCause = navCause;
        if (relaunch) {
          await relaunchChromium(navCause);
        }
        if (attempts < RETRY_MAX_ATTEMPTS) {
          const backoff = RETRY_BACKOFF_MS * attempts;
          console.warn(`[audit] retry ${attempts}/${RETRY_MAX_ATTEMPTS} for ${routePath} after ${backoff}ms (${navCause.slice(0, 60)})`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        // Final attempt failed — record as before but with attempts count.
        row = {
          route: routePath, a1: "FAIL", a2: "SKIP", a3: "SKIP", a4: "FAIL", a5: "SKIP",
          note: `probe-throw (after ${attempts} attempts): ${lastThrowMsg.slice(0, 120)}; ${navCause}`,
          shot: null, cls,
          landedUrl: "", navTrace: [], navCause, dom4xx: [], retries: attempts - 1,
        };
      }
    }
    // safety net
    if (!row) {
      row = {
        route: routePath, a1: "FAIL", a2: "SKIP", a3: "SKIP", a4: "FAIL", a5: "SKIP",
        note: `probe-loop-exhausted: ${lastThrowMsg.slice(0, 120)}`,
        shot: null, cls, landedUrl: "", navTrace: [],
        navCause: lastHarnessCause || "unclassified", dom4xx: [], retries: attempts - 1,
      };
    }
    if (attempts > 1) {
      console.log(`[audit] route ${routePath} resolved after ${attempts} attempts (final ${row.a4 === "PASS" ? "PASS" : "FAIL"})`);
    }
    // Phase 5: stamp wall-clock duration on every row for the metrics block.
    row.durationMs = Date.now() - probeT0;
    results.push(row);
    const tag = [row.a1, row.a2, row.a3, row.a4, row.a5].includes("FAIL") ? "FAIL"
      : (row.a1 === "PASS" ? "PASS" : "SKIP");
    // Phase 1 instrumentation: capture the first failing route so the
    // operator can bisect across runs without rereading the per-route
    // table. Tracks the FIRST failure only — subsequent failures are
    // visible in the normal a4Failures list.
    if (tag === "FAIL" && firstFailureIdx === -1) {
      firstFailureIdx = routeIdx;
      firstFailureRoute = routePath;
    }
    console.log(`${tag.padEnd(5)} ${routePath.padEnd(60)} ${row.a1}/${row.a2}/${row.a3}/${row.a4}/${row.a5} ${row.note || ""}`.slice(0, 200));
    if (results.length % 10 === 0) {
      fs.writeFileSync(path.join(OUT_DIR, "progress.json"), JSON.stringify({ done: results.length, total: routes.length, results }, null, 2));
    }
  }
  // Phase 1 instrumentation: capture the final post-loop snapshot so the
  // operator can quantify memory/fd/page growth across the whole run.
  await sampleRuntimeMetrics("shutdown", routes.length);

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
  //
  // Phase 6: classification is delegated to ./lib/nav-cause-taxonomy.cjs
  // (closed enum + per-code metadata). Every a4=FAIL row gets a
  // canonical `code` (e.g. "harness.timeout") and the enriched
  // {category, severity, retryable} metadata, so downstream tools no
  // longer regex-parse the raw navCause string.
  const a4Failures = results.filter((r) => r.a4 === "FAIL");
  const causeHistogram = {};
  const codeHistogram = {};
  const categoryHistogram = { harness: 0, authz: 0, auth: 0, unknown: 0 };
  for (const r of a4Failures) {
    const raw = (r.navCause || "unclassified").replace(/^navCause=/, "");
    causeHistogram[raw] = (causeHistogram[raw] || 0) + 1;
    const entry = navTaxonomy.classify(raw);
    r.navCauseCode = entry.code;
    r.navCauseCategory = entry.category;
    r.navCauseSeverity = entry.severity;
    codeHistogram[entry.code] = (codeHistogram[entry.code] || 0) + 1;
    categoryHistogram[entry.category]++;
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
        category: navTaxonomy.categoryOf(r.navCause || ""),
        code: navTaxonomy.classify(r.navCause || "").code,
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
  // === Phase 5: metrics block + timings.json ===
  // Per-route wall-clock distribution (probeT0..probeT1 incl. retries),
  // plus the four operational counters (chromiumCrashCount,
  // reloginCount, apiRestartCount, totalRetries). Slow-routes list is
  // bounded to the top-15 so the operator can quickly spot a regression
  // without paging through the full per-route table.
  function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx];
  }
  const timed = results.filter((r) => Number.isFinite(r.durationMs)).map((r) => ({
    route: r.route, durationMs: r.durationMs, retries: r.retries || 0,
    a4: r.a4, navCause: r.navCause || "",
  }));
  const durationsAsc = timed.map((r) => r.durationMs).sort((a, b) => a - b);
  const totalRetries = timed.reduce((s, r) => s + (r.retries || 0), 0);
  const routesWithRetries = timed.filter((r) => (r.retries || 0) > 0).length;
  const slowestN = parseInt(process.env.SLOWEST_N || "15", 10);
  const slowestRoutes = timed.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, slowestN);
  const metrics = {
    timed: timed.length,
    avgLoadMs: timed.length ? Math.round(durationsAsc.reduce((a, b) => a + b, 0) / durationsAsc.length) : 0,
    minMs: durationsAsc[0] || 0,
    p50Ms: percentile(durationsAsc, 50),
    p95Ms: percentile(durationsAsc, 95),
    p99Ms: percentile(durationsAsc, 99),
    maxMs: durationsAsc[durationsAsc.length - 1] || 0,
    totalProbeMs: durationsAsc.reduce((a, b) => a + b, 0),
    totalRetries,
    routesWithRetries,
    chromiumCrashes: chromiumCrashCount,
    relogins: reloginCount,
    apiServerRestartsDetected: apiRestartCount,
    pageRecycles: pageRecycleCount,
    slowestRoutes,
  };

  // === Phase 1 instrumentation: derived aggregate + sidecar file ===
  //
  // The per-sample series lives in instrumentation.json so it doesn't
  // bloat summary.json — the aggregate roll-up (peaks, deltas,
  // first-failure index, health-latency p95) is what most operators
  // need to spot regressions and is summarised back into metrics.
  function aggregateInstrumentation(samples) {
    if (samples.length === 0) {
      return {
        sampleCount: 0,
        firstFailureIdx,
        firstFailureRoute,
        memoryPeakRss: 0,
        memoryPeakHeapUsed: 0,
        memoryDeltaRss: 0,
        fdPeak: null,
        fdDelta: null,
        browserPagesPeak: 0,
        browserPagesFinal: 0,
        healthOkSamples: 0,
        healthFailSamples: 0,
        healthLatencyAvgMs: 0,
        healthLatencyP95Ms: 0,
      };
    }
    const boot = samples[0];
    const last = samples[samples.length - 1];
    const memRss = samples.map((s) => s.memory.rss);
    const memHeap = samples.map((s) => s.memory.heapUsed);
    const fdVals = samples.map((s) => s.fd).filter((v) => Number.isFinite(v));
    const pages = samples.map((s) => s.browser.pageCount);
    const healthOk = samples.filter((s) => s.health && s.health.ok).length;
    const healthFail = samples.length - healthOk;
    const latencies = samples.map((s) => (s.health && s.health.latencyMs) || 0).sort((a, b) => a - b);
    const lp = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : 0;
    // Frontend latency aggregates (separate from /healthz so we can
    // tell "vite/static slow" from "api slow"). Samples without a
    // `.frontend` field — from runs before this PR — are filtered out
    // gracefully so re-running the aggregator on old packs still works.
    const frontendSamples = samples.filter((s) => s.frontend);
    const frontendOk = frontendSamples.filter((s) => s.frontend.ok).length;
    const frontendFail = frontendSamples.length - frontendOk;
    const frontendLat = frontendSamples.map((s) => s.frontend.latencyMs || 0).sort((a, b) => a - b);
    const flp = (p) => frontendLat.length ? frontendLat[Math.min(frontendLat.length - 1, Math.floor((p / 100) * frontendLat.length))] : 0;
    return {
      sampleCount: samples.length,
      firstFailureIdx,
      firstFailureRoute,
      memoryPeakRss: Math.max(...memRss),
      memoryPeakHeapUsed: Math.max(...memHeap),
      memoryDeltaRss: last.memory.rss - boot.memory.rss,
      fdPeak: fdVals.length ? Math.max(...fdVals) : null,
      fdDelta: fdVals.length >= 2 ? fdVals[fdVals.length - 1] - fdVals[0] : null,
      browserPagesPeak: Math.max(...pages),
      browserPagesFinal: last.browser.pageCount,
      healthOkSamples: healthOk,
      healthFailSamples: healthFail,
      healthLatencyAvgMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      healthLatencyP95Ms: lp(95),
      frontendSampleCount: frontendSamples.length,
      frontendOkSamples: frontendOk,
      frontendFailSamples: frontendFail,
      frontendLatencyAvgMs: frontendLat.length ? Math.round(frontendLat.reduce((a, b) => a + b, 0) / frontendLat.length) : 0,
      frontendLatencyP95Ms: flp(95),
    };
  }
  const instrumentationAgg = aggregateInstrumentation(instrumentationSamples);
  fs.writeFileSync(path.join(RUN_DIR, "instrumentation.json"), JSON.stringify({
    runId: RUN_ID,
    startedAt: RUN_STARTED_AT,
    endedAt: runEndedAt,
    aggregate: instrumentationAgg,
    samples: instrumentationSamples,
  }, null, 2));

  fs.writeFileSync(path.join(RUN_DIR, "timings.json"), JSON.stringify({
    runId: RUN_ID,
    startedAt: RUN_STARTED_AT,
    endedAt: runEndedAt,
    metrics,
    routes: timed,
  }, null, 2));

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
    metrics,
    instrumentation: instrumentationAgg,
    legacyAllJsonPath: out,
  }, null, 2));

  // Compact human-readable summary to stdout — easy to eyeball in CI logs.
  console.log(`\n[#runtime-v2 metrics] run=${RUN_ID}`);
  console.log(`  routes=${results.length} pass=${counts.pass} fail=${counts.fail} skip=${counts.skip}`);
  console.log(`  duration=${(runDurationMs/1000).toFixed(1)}s avgLoad=${metrics.avgLoadMs}ms p50=${metrics.p50Ms}ms p95=${metrics.p95Ms}ms p99=${metrics.p99Ms}ms max=${metrics.maxMs}ms`);
  console.log(`  retries=${metrics.totalRetries} (on ${metrics.routesWithRetries} routes) · chromiumCrashes=${metrics.chromiumCrashes} · relogins=${metrics.relogins} · apiRestarts=${metrics.apiServerRestartsDetected} · pageRecycles=${metrics.pageRecycles}`);
  // Phase 1 instrumentation rollup — one terse line per dimension so
  // operators can eyeball harness-side regression vs app-side regression.
  const ia = instrumentationAgg;
  console.log(`  instrumentation samples=${ia.sampleCount} · rss peak=${(ia.memoryPeakRss/1024/1024).toFixed(0)}MB Δ=${(ia.memoryDeltaRss/1024/1024).toFixed(0)}MB · fd peak=${ia.fdPeak ?? "n/a"} Δ=${ia.fdDelta ?? "n/a"} · pages peak=${ia.browserPagesPeak} final=${ia.browserPagesFinal} · health=${ia.healthOkSamples}ok/${ia.healthFailSamples}fail avg=${ia.healthLatencyAvgMs}ms p95=${ia.healthLatencyP95Ms}ms`);
  if (ia.frontendSampleCount) {
    console.log(`  frontend (BASE/) ${ia.frontendOkSamples}ok/${ia.frontendFailSamples}fail · avg=${ia.frontendLatencyAvgMs}ms p95=${ia.frontendLatencyP95Ms}ms`);
  }
  if (ia.firstFailureIdx >= 0) {
    console.log(`  first failure at idx ${ia.firstFailureIdx}: ${ia.firstFailureRoute}`);
  }
  if (slowestRoutes.length > 0) {
    console.log(`  ── SLOWEST ${Math.min(5, slowestRoutes.length)} ──`);
    for (const r of slowestRoutes.slice(0, 5)) {
      console.log(`    ${String(r.durationMs).padStart(6)}ms  ${r.route}` + (r.retries ? ` (retries=${r.retries})` : ""));
    }
  }
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
    failures: a4Failures.map((r) => {
      const trace = r.navTrace || [];
      return {
        route: r.route,
        landedUrl: r.landedUrl || "",
        navCause: r.navCause || "",
        category: navTaxonomy.categoryOf(r.navCause || ""),
        code: navTaxonomy.classify(r.navCause || "").code,
        severity: navTaxonomy.classify(r.navCause || "").severity,
        // Phase 1 instrumentation surface: the last nav-event label
        // for this failure. Operators frequently only need this one
        // label to classify the failure shape (e.g. "postSleep1s",
        // "framenavigated:/login", "goto:domcontentloaded") rather
        // than reading the full trace. Full trace stays in `navTrace`.
        navTraceLastLabel: trace.length ? trace[trace.length - 1].label : null,
        navTrace: trace,
        api4xx: r.dom4xx || [],
        note: r.note,
        shot: r.shot || "",
      };
    }),
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
