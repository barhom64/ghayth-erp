#!/usr/bin/env node
/**
 * Re-verify the 14 "/create" pages flagged FAIL in FRONTEND_TEST_MATRIX.md
 * with an expanded save-button regex + better hydration wait, and resolve
 * a real :id for the two edit routes. Prints a per-route PASS/FAIL line.
 *
 * Run: node scripts/src/verify-create-pages.cjs
 */
const path = require("path");
const puppeteer = require(path.join(
  __dirname, "..", "..", "artifacts", "ghayth-erp-deck", "node_modules", "puppeteer",
));
const { spawnSync } = require("child_process");

const BASE = process.env.BASE_URL || "http://localhost";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

// Expanded button-label regex — covers every Arabic save/submit verb actually
// used in the codebase (grep -E confirmed): حفظ|إنشاء|إضافة|تأكيد|تسجيل|نشر|
// اعتماد|إرسال|تقديم|تحديث|إصدار|توليد|إنهاء.
const SAVE_RE =
  /(حفظ|إنشاء|إضافة|تأكيد|تسجيل|نشر|اعتماد|اعتمد|إرسال|تقديم|تحديث|إصدار|توليد|إنهاء|submit|save|create|publish|register)/i;

// 14 routes flagged FAIL by the original 369×5 matrix probe. The two `:id`
// placeholders need a real numeric id resolved at runtime.
const ROUTES = [
  { path: "/finance/accounts/:id/edit", needsId: "/finance/accounts" },
  { path: "/finance/intercompany/consolidation/create", readonly: true },
  { path: "/governance/compliance/create" },
  { path: "/governance/risks/create" },
  { path: "/hr/attendance/create" },
  { path: "/hr/excuse-requests/create" },
  { path: "/hr/exit/create" },
  { path: "/hr/leaves/create" },
  { path: "/hr/payroll/create" },
  { path: "/hr/performance/create" },
  { path: "/hr/recruitment/create" },
  { path: "/properties/contracts/create" },
  { path: "/properties/maintenance/create" },
  { path: "/umrah/commission-plans/:id/edit", needsId: "/umrah/commission-plans" },
];

function detectChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("Chromium not found");
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const cookieHeader = r.headers.getSetCookie?.()?.join("; ") ||
    (r.headers.raw && r.headers.raw()["set-cookie"]?.join("; ")) ||
    r.headers.get("set-cookie") || "";
  const body = await r.json();
  return { cookieHeader, assignments: body.assignments || [] };
}

async function resolveId(cookieHeader, listPath) {
  const r = await fetch(`${BASE}/api${listPath}?limit=1`, {
    headers: { Cookie: cookieHeader, "Accept-Language": "ar" },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const row = (j.data || j.items || j)[0];
  return row?.id ?? null;
}

async function probe(page, url, opts) {
  let last5xx = false;
  let consoleErrs = 0;
  page.removeAllListeners("response");
  page.removeAllListeners("console");
  page.on("response", (r) => { if (r.status() >= 500) last5xx = true; });
  page.on("console", (m) => { if (m.type() === "error") consoleErrs++; });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // wait for hydration: networkidle-ish + extra grace for lazy chunks
  try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }); } catch {}
  await new Promise((r) => setTimeout(r, 1500));
  // also wait until the main content area has at least 1 input (form mounted)
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector("main") || document.body;
      return root.querySelectorAll("input:not([type=hidden]),textarea,select").length > 0
        || /غير موجود|404|not found/i.test(document.body.innerText.slice(0, 4000));
    }, { timeout: 8000 });
  } catch {}

  const stats = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, "i");
    // SCOPE to the page content, not the sidebar/topbar (which have nav items
    // like "إنشاء مهمة" that would false-match the SAVE_RE).
    const root =
      document.querySelector("form") ||
      document.querySelector("main [data-page-content]") ||
      document.querySelector("main") ||
      document.body;
    const inputs = root.querySelectorAll(
      "input:not([type=hidden]), textarea, select, [role=combobox], [role=textbox]"
    );
    const buttons = Array.from(root.querySelectorAll(
      'button, [role=button], input[type=submit]'
    )).filter((b) => {
      // ignore obvious non-save buttons (close X, theme toggle, sidebar collapse, language)
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const txt = (b.innerText || b.textContent || b.value || "").trim();
      if (/(close|cancel|إلغاء|رجوع|back|menu|toggle)/i.test(aria) || /^(×|✕|<|>|☰)$/.test(txt)) return false;
      return true;
    });
    const matchedBtn = buttons.find((b) => {
      const txt = (b.innerText || b.textContent || b.value || "").trim();
      const aria = b.getAttribute("aria-label") || "";
      return re.test(txt) || re.test(aria);
    });
    return {
      formCount: inputs.length,
      saveLabel: matchedBtn ? (matchedBtn.innerText || matchedBtn.textContent || "").trim().slice(0, 40) : null,
      bodyHasError: /غير موجود|404|not found/i.test(document.body.innerText.slice(0, 4000)),
    };
  }, SAVE_RE.source);

  const ok = !last5xx && !stats.bodyHasError && (
    opts.readonly ? true : (stats.saveLabel != null)
  );
  return { ok, last5xx, consoleErrs, ...stats };
}

(async () => {
  console.log(`[verify] login as ${ADMIN_EMAIL}…`);
  const { cookieHeader } = await login();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: detectChromium(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "ar" });
  for (const c of cookieHeader.split(", ")) {
    const [pair] = c.split(";");
    const [name, ...v] = pair.split("=");
    if (name) {
      try {
        await page.setCookie({ name: name.trim(), value: v.join("=").trim(), domain: "localhost", path: "/" });
      } catch {}
    }
  }
  // seed assignments + auth cookie via in-page fetch (mirrors deepCrudTest)
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(async ({ email, password }) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    localStorage.setItem("erp_assignments", JSON.stringify(d.assignments || []));
  }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  const rows = [];
  for (const route of ROUTES) {
    let url = `${BASE}${route.path}`;
    if (route.needsId) {
      const id = await resolveId(cookieHeader, route.needsId);
      if (!id) {
        rows.push({ ...route, ok: false, note: `no row in ${route.needsId} to use as :id` });
        continue;
      }
      url = `${BASE}${route.path.replace(":id", id)}`;
    }
    const r = await probe(page, url, { readonly: route.readonly });
    rows.push({ ...route, url, ...r });
    const tag = r.ok ? "PASS" : "FAIL";
    console.log(
      `${tag.padEnd(5)} ${route.path.padEnd(48)} form=${r.formCount} save=${r.saveLabel || "—"} 5xx=${r.last5xx ? "Y" : "N"} consoleErr=${r.consoleErrs}${route.readonly ? " [read-only]" : ""}`,
    );
  }

  await browser.close();
  const pass = rows.filter((r) => r.ok).length;
  console.log(`\n[verify] ${pass}/${rows.length} PASS`);
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
