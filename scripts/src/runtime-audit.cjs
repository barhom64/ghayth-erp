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

const BASE = process.env.BASE_URL || "http://localhost";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";
const BATCH = parseInt(process.env.BATCH || "0", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50", 10);
const OUT_DIR = process.env.OUT_DIR || "/tmp/runtime-audit";
const SHOT_DIR = process.env.SHOT_DIR || "audit/screenshots";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

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
  let navCause = "";
  if (a4 === "FAIL") {
    const firstApi4xx = network.status4xx[0] || "";
    const has401 = /\b401\b/.test(network.status4xx.join(" "));
    const sawLoginInTrace = navTrace.some((e) => /\/login(\?|$)/.test(e.url));
    if (has401 && sawLoginInTrace) navCause = "navCause=api401→/login (apiFetch hard redirect)";
    else if (dom.accessDenied) navCause = "navCause=AccessDenied (URL didn't change; expected match was prefix-based)";
    else if (sawLoginInTrace) navCause = "navCause=app-redirect-to-login (no captured 401 — refresh path?)";
    else if (!dom.lsHasSession) navCause = "navCause=localStorage cleared (session lost mid-nav)";
    else if (firstApi4xx) navCause = `navCause=api4xx ${firstApi4xx}`;
    else navCause = `navCause=unclassified (trace=${navTrace.map((e) => e.label).join(",")})`;
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
      row = {
        route: routePath, a1: "FAIL", a2: "SKIP", a3: "SKIP", a4: "FAIL", a5: "SKIP",
        note: `probe-throw: ${String(e.message).slice(0, 120)}`, shot: null, cls,
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
  const a4Failures = results.filter((r) => r.a4 === "FAIL");
  const causeHistogram = {};
  for (const r of a4Failures) {
    const c = (r.navCause || "navCause=unknown").replace(/^navCause=/, "");
    causeHistogram[c] = (causeHistogram[c] || 0) + 1;
  }
  if (a4Failures.length > 0) {
    console.log("\n[#638 nav-cause histogram]");
    for (const [cause, count] of Object.entries(causeHistogram).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)} × ${cause}`);
    }
  }
  if (process.env.DIAG === "1") {
    const diagOut = path.join(OUT_DIR, `${tag}_nav-diag.json`);
    fs.writeFileSync(diagOut, JSON.stringify({
      batch: BATCH,
      generatedAt: new Date().toISOString(),
      summary: { totalProbed: results.length, a4Failures: a4Failures.length, causeHistogram },
      failures: a4Failures.map((r) => ({
        route: r.route,
        landedUrl: r.landedUrl,
        navCause: r.navCause,
        navTrace: r.navTrace,
        api4xx: r.dom4xx,
        note: r.note,
      })),
    }, null, 2));
    console.log(`[#638] DIAG sidecar → ${diagOut}`);
  }
  console.log(`[audit] wrote ${out} (${results.length} rows)`);
})().catch((e) => { console.error("[audit] fatal:", e); process.exit(2); });
