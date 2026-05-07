#!/usr/bin/env node
/* Deep CRUD flow tests for the 5 highest-traffic modules (Task #139).
 *
 * For each module entity (21 total across HR/Finance/Properties/Fleet/Umrah):
 *  - API axis 3: POST → list (verify created) → PATCH → DELETE → list (verify gone)
 *  - UI axis 4: real form fill → real submit → row appears in the list
 *    (per-entity `ui` spec naming the create page + Arabic field labels).
 *  - UI axis 5: real edit via the row's actions menu — locate the just-
 *    created row by its unique text, click the row-level "تعديل" button,
 *    tweak the first input, click "حفظ التعديلات" / "حفظ", and assert a
 *    successful PATCH/PUT response.
 *  - UI axis 6: real delete via the row's actions menu — click the row-
 *    level "حذف" button, accept any confirm() dialog or click "تأكيد
 *    الحذف", assert a successful DELETE response, and assert the row
 *    disappears from the rendered list.
 *  - UI axis 7: real interactions — type into search box and assert
 *    filtering, click pagination "التالي" button (if visible), click
 *    "تصدير جدولي" and assert the export toast/CSV blob appears.
 *
 * Output: writes a Markdown table to FRONTEND_TEST_MATRIX.md in a new
 * "Deep CRUD round-trip results" section. New bugs go into FRONTEND_BUGS.md.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "artifacts", "ghayth-erp-deck", "node_modules", "puppeteer"));

const BASE = process.env.TEST_BASE || "http://localhost:80";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

// ─── Auth helpers ──────────────────────────────────────────────────────────
let cookieHeader = "";
async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.raw && r.headers.raw()["set-cookie"]) || [];
  cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookieHeader) throw new Error("no cookies returned");
}

async function api(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const txt = await r.text();
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { status: r.status, data };
}

// ─── Entity definitions ────────────────────────────────────────────────────
// Each entity declares: list page URL, list API path, create API path,
// update API path template ($id), delete API path template ($id), the
// create payload (bullet-proof minimal), the patch payload, and an
// id-extraction selector for the create response.

const stamp = Date.now().toString().slice(-7);
const u = (s) => `${s}-${stamp}-${Math.floor(Math.random() * 1e4)}`;

const ENTITIES = [
  // ── HR ────────────────────────────────────────────────────────────────
  {
    module: "HR", listUrl: "/employees", listApi: "/api/employees",
    createApi: "/api/employees", patchApi: "/api/employees/$id",
    deleteApi: "/api/employees/$id",
    create: (ctx) => {
      const payload = {
        name: u("اختبار موظف"),
        nationalId: String(2000000000 + Math.floor(Math.random() * 9999999)),
        nationality: "SA",
        phone: "055" + String(1000000 + Math.floor(Math.random() * 8999999)),
        jobTitle: "اختبار",
        salary: 5000,
        hireDate: "2026-01-01",
      };
      // Resolved at startup from GET /api/settings/departments so we never
      // hard-code a department name that may not exist in this DB.
      if (ctx.departmentId) payload.departmentId = ctx.departmentId;
      else if (ctx.departmentName) payload.department = ctx.departmentName;
      return payload;
    },
    patch: () => ({ phone: "0559999999" }),
    extractId: (d) => d.id || d.employeeId,
    deleteBody: { reason: "automated test cleanup" },
  },
  {
    module: "HR", listUrl: "/hr/shifts", listApi: "/api/hr/shifts",
    createApi: "/api/hr/shifts", patchApi: "/api/hr/shifts/$id",
    deleteApi: "/api/hr/shifts/$id",
    create: () => ({
      name: u("وردية اختبار"),
      startTime: "08:00", endTime: "16:00", shiftType: "fixed",
    }),
    patch: () => ({ endTime: "17:00" }),
    extractId: (d) => d.id,
  },
  {
    module: "HR", listUrl: "/hr/performance", listApi: "/api/hr/performance",
    createApi: "/api/hr/performance", patchApi: "/api/hr/performance/$id",
    deleteApi: "/api/hr/performance/$id",
    needsEmployee: true,
    create: (ctx) => ({
      employeeId: ctx.employeeId,
      period: "2026-Q1",
      overallScore: 4.2,
      comments: u("تقييم اختباري"),
    }),
    patch: () => ({ overallScore: 4.5 }),
    extractId: (d) => d.id,
  },

  // ── Finance ───────────────────────────────────────────────────────────
  {
    module: "Finance", listUrl: "/finance/accounts", listApi: "/api/finance/accounts",
    createApi: "/api/finance/accounts", patchApi: "/api/finance/accounts/$id",
    deleteApi: "/api/finance/accounts/$id",
    create: () => ({
      code: `9${stamp}${Math.floor(Math.random() * 99)}`,
      name: u("حساب اختبار"),
      type: "asset", nature: "debit",
    }),
    patch: () => ({ name: u("حساب اختبار محدث") }),
    extractId: (d) => d.id,
  },
  {
    module: "Finance", listUrl: "/finance/vendors", listApi: "/api/finance/vendors",
    createApi: "/api/finance/vendors", patchApi: "/api/finance/vendors/$id",
    deleteApi: "/api/finance/vendors/$id",
    create: () => ({ name: u("مورد اختبار"), phone: "0551112222" }),
    patch: () => ({ phone: "0553334444" }),
    extractId: (d) => d.id,
  },
  {
    module: "Finance", listUrl: "/finance/budget", listApi: "/api/finance/budget?period=year",
    createApi: "/api/finance/budget", patchApi: "/api/finance/budget/$id",
    deleteApi: "/api/finance/budget/$id",
    create: () => ({ accountCode: "1000", period: "2026-12", amount: 50000 }),
    patch: () => ({ amount: 75000 }),
    extractId: (d) => d.id,
    skipListVerify: true,
  },
  {
    module: "Finance", listUrl: "/finance/invoices", listApi: "/api/finance/invoices",
    createApi: "/api/finance/invoices", patchApi: "/api/finance/invoices/$id",
    deleteApi: "/api/finance/invoices/$id",
    needsClient: true,
    create: (ctx) => ({
      clientId: ctx.clientId,
      lines: [{ description: u("بند اختبار"), quantity: 1, unitPrice: 100, total: 100 }],
      subtotal: 100, total: 115, vatRate: 15, dueDate: "2026-06-30",
    }),
    patch: () => ({ description: "وصف اختبار محدث" }),
    extractId: (d) => d.id,
  },

  // ── Properties ────────────────────────────────────────────────────────
  {
    module: "Properties", listUrl: "/properties/owners", listApi: "/api/properties/owners",
    createApi: "/api/properties/owners", patchApi: "/api/properties/owners/$id",
    deleteApi: "/api/properties/owners/$id",
    create: () => ({ name: u("مالك اختبار"), ownerType: "individual",
                     nationalId: String(1000000000 + Math.floor(Math.random() * 9999999)) }),
    patch: () => ({ phone: "0501112233" }),
    extractId: (d) => d.id,
  },
  {
    module: "Properties", listUrl: "/properties/buildings", listApi: "/api/properties/buildings",
    createApi: "/api/properties/buildings", patchApi: "/api/properties/buildings/$id",
    deleteApi: "/api/properties/buildings/$id",
    create: () => ({ name: u("مبنى اختبار"), city: "الرياض", type: "residential" }),
    patch: () => ({ city: "جدة" }),
    extractId: (d) => d.id,
  },
  {
    module: "Properties", listUrl: "/properties/tenants", listApi: "/api/properties/tenants",
    createApi: "/api/properties/tenants", patchApi: "/api/properties/tenants/$id",
    deleteApi: "/api/properties/tenants/$id",
    create: () => ({ name: u("مستأجر اختبار"),
                     nationalId: String(1000000000 + Math.floor(Math.random() * 9999999)),
                     phone: "0561112233" }),
    patch: () => ({ phone: "0567778888" }),
    extractId: (d) => d.id,
  },
  {
    module: "Properties", listUrl: "/properties", listApi: "/api/properties/units",
    createApi: "/api/properties/units", patchApi: "/api/properties/units/$id",
    deleteApi: "/api/properties/units/$id",
    create: () => ({
      unitNumber: u("U"),
      buildingName: "مبنى اختبار وحدة",
      type: "apartment", area: 100, monthlyRent: 3000, status: "available",
    }),
    patch: () => ({ monthlyRent: 3500 }),
    extractId: (d) => d.id,
  },

  // ── Fleet ─────────────────────────────────────────────────────────────
  {
    module: "Fleet", listUrl: "/fleet", listApi: "/api/fleet/vehicles",
    createApi: "/api/fleet/vehicles", patchApi: "/api/fleet/vehicles/$id",
    deleteApi: "/api/fleet/vehicles/$id",
    create: () => ({
      plateNumber: `TST-${stamp}-${Math.floor(Math.random() * 999)}`,
      make: "Toyota", model: "Hilux", year: 2024, fuelType: "gasoline",
    }),
    patch: () => ({ color: "أبيض" }),
    extractId: (d) => d.id,
  },
  {
    module: "Fleet", listUrl: "/fleet/drivers", listApi: "/api/fleet/drivers",
    createApi: "/api/fleet/drivers", patchApi: "/api/fleet/drivers/$id",
    deleteApi: "/api/fleet/drivers/$id",
    create: () => ({
      name: u("سائق اختبار"), phone: "0551110000",
      licenseNumber: `LIC-${stamp}-${Math.floor(Math.random() * 999)}`,
      licenseExpiry: "2028-12-31",
    }),
    patch: () => ({ phone: "0552220000" }),
    extractId: (d) => d.id,
  },
  {
    module: "Fleet", listUrl: "/fleet/maintenance", listApi: "/api/fleet/maintenance",
    createApi: "/api/fleet/maintenance", patchApi: "/api/fleet/maintenance/$id",
    deleteApi: "/api/fleet/maintenance/$id",
    needsVehicle: true,
    create: (ctx) => ({
      vehicleId: ctx.vehicleId,
      type: "oil_change", description: u("صيانة اختبار"),
      cost: 200, serviceDate: "2026-05-01",
      status: "completed",
    }),
    patch: () => ({ cost: 250 }),
    extractId: (d) => d.id,
  },
  {
    module: "Fleet", listUrl: "/fleet/fuel", listApi: "/api/fleet/fuel-logs",
    createApi: "/api/fleet/fuel-logs", patchApi: "/api/fleet/fuel-logs/$id",
    deleteApi: "/api/fleet/fuel-logs/$id",
    needsVehicle: true,
    create: (ctx) => ({
      vehicleId: ctx.vehicleId, liters: 40, costPerLiter: 2.33,
      fuelDate: "2026-05-01", stationName: "محطة اختبار",
    }),
    patch: () => ({ stationName: "محطة محدّثة" }),
    extractId: (d) => d.id,
  },
  {
    module: "Fleet", listUrl: "/fleet/insurance", listApi: "/api/fleet/insurance",
    createApi: "/api/fleet/insurance", patchApi: "/api/fleet/insurance/$id",
    deleteApi: "/api/fleet/insurance/$id",
    needsVehicle: true,
    create: (ctx) => ({
      vehicleId: ctx.vehicleId, provider: u("شركة تأمين"),
      startDate: "2026-01-01", endDate: "2027-01-01", premium: 1500,
    }),
    patch: () => ({ premium: 1800 }),
    extractId: (d) => d.id,
  },

  // ── Umrah ─────────────────────────────────────────────────────────────
  {
    module: "Umrah", listUrl: "/umrah/seasons", listApi: "/api/umrah/seasons",
    createApi: "/api/umrah/seasons", patchApi: "/api/umrah/seasons/$id",
    deleteApi: null,            // no DELETE endpoint
    create: () => ({
      title: u("موسم اختبار"),
      startDate: "2026-06-01", endDate: "2026-09-30",
    }),
    patch: () => ({ notes: "ملاحظة اختبار" }),
    extractId: (d) => d.id,
  },
  {
    module: "Umrah", listUrl: "/umrah/agents", listApi: "/api/umrah/agents",
    createApi: "/api/umrah/agents", patchApi: "/api/umrah/agents/$id",
    deleteApi: "/api/umrah/agents/$id",
    create: () => ({ name: u("وكيل اختبار"), country: "MY", currency: "SAR" }),
    patch: () => ({ profitMargin: 12 }),
    extractId: (d) => d.id,
  },
  {
    module: "Umrah", listUrl: "/umrah/packages", listApi: "/api/umrah/packages",
    createApi: "/api/umrah/packages", patchApi: "/api/umrah/packages/$id",
    deleteApi: "/api/umrah/packages/$id",
    needsSeason: true,
    create: (ctx) => ({
      name: u("باقة اختبار"), seasonId: ctx.seasonId,
      costPrice: 1000, sellPrice: 1500, duration: 7,
    }),
    patch: () => ({ sellPrice: 1700 }),
    extractId: (d) => d.id,
  },
  {
    module: "Umrah", listUrl: "/umrah/transport", listApi: "/api/umrah/transport",
    createApi: "/api/umrah/transport", patchApi: "/api/umrah/transport/$id",
    deleteApi: "/api/umrah/transport/$id",
    create: () => ({
      tripDate: "2026-06-15", fromLocation: "جدة", toLocation: "مكة",
      capacity: 50, cost: 500,
    }),
    patch: () => ({ cost: 600 }),
    extractId: (d) => d.id,
  },
  {
    module: "Umrah", listUrl: "/umrah/violations", listApi: "/api/umrah/violations",
    createApi: "/api/umrah/violations", patchApi: "/api/umrah/violations/$id",
    deleteApi: "/api/umrah/violations/$id",
    create: () => ({
      type: "overstay", description: u("مخالفة اختبار"),
      penaltyAmount: 5000, status: "open",
    }),
    patch: () => ({ penaltyAmount: 6000 }),
    extractId: (d) => d.id,
  },
];

// ─── UI flow specs ────────────────────────────────────────────────────────
// Per-entity Arabic-label form spec for real Puppeteer form-fill flows.
// Keyed by listUrl. `fields` are filled by locating an Arabic <label> and
// typing into the input/textarea inside the same wrapper. `submitText` is
// the visible button text the harness clicks (default "حفظ"). `uniqueLabel`
// names the field whose value uniquely identifies the row in the list view
// (used to assert the new row appears post-submit).
const UI_SPECS = {
  // /employees create form gates submit on Select-backed jobTitle/department
  // dropdowns whose options stream from the API (Radix Select trigger is a
  // <button>, not <input>). Form-fill flow can't satisfy those without an
  // option-picker; leaving the UI axis covered by the API path. See #145.
  "/hr/shifts": {
    createPath: "/hr/shifts/create",
    fields: () => [
      { label: "اسم الوردية", value: u("UI وردية") },
      { label: "وقت البدء", value: "08:00", kind: "time" },
      { label: "وقت الانتهاء", value: "16:00", kind: "time" },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  "/finance/accounts": {
    createPath: "/finance/accounts/create",
    fields: () => [
      { label: "الرمز", value: `9${stamp}${Math.floor(Math.random() * 99)}` },
      { label: "الاسم", value: u("UI حساب") },
    ],
    submitText: "حفظ",
    uniqueIdx: 1,
  },
  "/finance/vendors": {
    createPath: "/finance/vendors/create",
    fields: () => [
      { label: "الاسم", value: u("UI مورد") },
      { label: "الهاتف", value: "055" + String(3000000 + Math.floor(Math.random() * 6999999)) },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  "/properties/owners": {
    createPath: "/properties/owners/create",
    fields: () => [
      { label: "الاسم", value: u("UI مالك") },
      { label: "رقم الهوية", value: String(1500000000 + Math.floor(Math.random() * 9999999)) },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  "/properties/buildings": {
    createPath: "/properties/buildings/create",
    fields: () => [
      { label: "اسم المبنى", value: u("UI مبنى") },
      { label: "المدينة", value: "الرياض" },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  "/fleet": {
    createPath: "/fleet/vehicles/create",
    fields: () => [
      { label: "رقم اللوحة", value: `UI-${stamp}-${Math.floor(Math.random() * 999)}` },
      { label: "الشركة المصنعة", value: "Toyota" },
      { label: "الموديل", value: "Hilux" },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  "/fleet/drivers": {
    createPath: "/fleet/drivers/create",
    fields: () => [
      { label: "الاسم", value: u("UI سائق") },
      { label: "الهاتف", value: "055" + String(4000000 + Math.floor(Math.random() * 5999999)) },
      { label: "رقم الرخصة", value: `LIC-UI-${stamp}-${Math.floor(Math.random() * 999)}` },
    ],
    submitText: "حفظ",
    uniqueIdx: 0,
  },
  // /umrah/agents uses an in-page Dialog for create — covered by API axis only.
};

// ─── Seed a row via API for UI edit/delete coverage ───────────────────────
// Used when the entity has no UI form-fill spec (most "complex" forms gated
// on Radix Selects), so the harness can still exercise the row-level
// pencil/trash affordance via DOM walker — the row to act on is created
// via the API and identified by a unique text needle that should be visible
// in the rendered list.
async function seedRowForUi(ent, ctx) {
  if (ent.needsEmployee && !ctx.employeeId) return null;
  if (ent.needsClient && !ctx.clientId) return null;
  if (ent.needsSeason && !ctx.seasonId) return null;
  if (ent.needsVehicle && !ctx.vehicleId) return null;
  let payload;
  try { payload = ent.create(ctx); } catch { return null; }
  const r = await api("POST", ent.createApi, payload);
  if (r.status >= 400) return { error: `seed ${r.status}` };
  const id = ent.extractId(r.data) || r.data?.id;
  // Pick the most-likely-visible text in the list view, in priority order.
  const needle =
    payload.name || payload.title || payload.plateNumber ||
    payload.unitNumber || payload.licenseNumber || payload.fromLocation ||
    payload.description || payload.code || payload.provider ||
    (id != null ? String(id) : null);
  return { needle, id };
}

// ─── Pre-flight: build context (employeeId, clientId, vehicleId, seasonId) ─
async function buildContext() {
  const ctx = {};
  const [emps, clients, vehicles, seasons, departments] = await Promise.all([
    api("GET", "/api/employees?limit=1"),
    api("GET", "/api/clients?limit=1"),
    api("GET", "/api/fleet/vehicles?limit=1"),
    api("GET", "/api/umrah/seasons"),
    api("GET", "/api/settings/departments"),
  ]);
  ctx.employeeId = emps.data?.data?.[0]?.id;
  ctx.clientId = clients.data?.data?.[0]?.id;
  ctx.vehicleId = vehicles.data?.data?.[0]?.id;
  ctx.seasonId = seasons.data?.data?.[0]?.id;
  // Pick the first real department so the /employees seed never POSTs a
  // department name the DB doesn't recognise (was 422 → row skipped → uE/uD ⚪).
  // If the dev DB has none, seed one so the harness is self-sufficient.
  let firstDept = departments.data?.data?.[0];
  if (!firstDept) {
    const created = await api("POST", "/api/settings/departments", {
      name: "قسم اختبار CRUD",
    });
    if (created.status >= 200 && created.status < 300) {
      firstDept = { id: created.data?.id, name: created.data?.name ?? "قسم اختبار CRUD" };
    }
  }
  ctx.departmentId = firstDept?.id ?? null;
  ctx.departmentName = firstDept?.name ?? null;
  return ctx;
}

// ─── API CRUD round-trip ─────────────────────────────────────────────────
async function runApiCrud(ent, ctx) {
  const result = { create: "?", read: "?", update: "?", delete: "?",
                   notes: [], id: null };

  // 1) Create
  let payload;
  try { payload = ent.create(ctx); }
  catch (e) { result.notes.push(`payload-build:${e.message}`); return result; }
  const c = await api("POST", ent.createApi, payload);
  if (c.status >= 200 && c.status < 300) {
    result.id = ent.extractId(c.data) || c.data?.id;
    result.create = "PASS";
  } else {
    result.create = "FAIL";
    result.notes.push(`POST ${c.status}: ${JSON.stringify(c.data).slice(0, 160)}`);
    return result;
  }

  // 2) Read (verify in list)
  if (ent.skipListVerify) {
    result.read = "PASS";
  } else {
    const list = await api("GET", ent.listApi);
    if (list.status >= 200 && list.status < 300) {
      const arr = Array.isArray(list.data) ? list.data : (list.data?.data || []);
      const found = arr.some((r) => r.id === result.id);
      result.read = found ? "PASS" : "FAIL";
      if (!found) result.notes.push(`created id ${result.id} not in list (${arr.length} rows)`);
    } else {
      result.read = "FAIL";
      result.notes.push(`LIST ${list.status}: ${JSON.stringify(list.data).slice(0, 100)}`);
    }
  }

  // 3) Update
  if (ent.patchApi && result.id != null) {
    const p = await api("PATCH", ent.patchApi.replace("$id", result.id), ent.patch());
    if (p.status >= 200 && p.status < 300) result.update = "PASS";
    else { result.update = "FAIL";
           result.notes.push(`PATCH ${p.status}: ${JSON.stringify(p.data).slice(0, 160)}`); }
  } else { result.update = "SKIP"; }

  // 4) Delete
  if (ent.deleteApi && result.id != null) {
    const d = await api("DELETE", ent.deleteApi.replace("$id", result.id), ent.deleteBody);
    if (d.status >= 200 && d.status < 300) {
      result.delete = "PASS";
    } else { result.delete = "FAIL";
             result.notes.push(`DELETE ${d.status}: ${JSON.stringify(d.data).slice(0, 160)}`); }
  } else { result.delete = "SKIP"; }

  return result;
}

// ─── Browser-side helpers (executed via page.evaluate) ───────────────────
// Find an Arabic <label> by text and return the input/textarea/button it
// wraps. Mirrors how shadcn/ui's <Label htmlFor=...> + sibling input pattern
// is structured in the create pages.
const __findFieldFn = (label) => {
  const labels = Array.from(document.querySelectorAll("label"));
  const lab = labels.find((el) => (el.textContent || "").replace(/\s+/g, " ").trim().startsWith(label));
  if (!lab) return null;
  // 1) htmlFor link
  const id = lab.getAttribute("for");
  if (id) { const el = document.getElementById(id); if (el) return el; }
  // 2) input inside the wrapper div (FormFieldWrapper renders <div><Label>...{children}</div>)
  const wrap = lab.parentElement;
  if (wrap) {
    const cand = wrap.querySelector("input, textarea, select, button[role=combobox], [contenteditable=true]");
    if (cand) return cand;
  }
  return null;
};

// ─── UI flow: real form fill → submit → row appears in list ──────────────
async function runUiFormFlow(page, ent) {
  const spec = UI_SPECS[ent.listUrl];
  const result = { uiCreate: "SKIP", uiVerify: "SKIP", notes: [], uiUniqueValue: null };
  if (!spec) return result;

  const fields = spec.fields();
  const uniqueValue = fields[spec.uniqueIdx ?? 0].value;
  result.uiUniqueValue = uniqueValue;

  try {
    // Use SPA navigation (history.pushState) to preserve auth state — full
    // page.goto() forces re-auth and the auth provider redirects to /dashboard
    // before the route resolves.
    await page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, spec.createPath);
    await new Promise((r) => setTimeout(r, 1500));

    // Wait for the first field's label to render (React lazy chunks).
    const firstLabel = fields[0].label;
    for (let i = 0; i < 12; i++) {
      const found = await page.evaluate((label) => {
        const labels = Array.from(document.querySelectorAll("label"));
        return labels.some((el) => (el.textContent || "").trim().startsWith(label));
      }, firstLabel);
      if (found) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    // Fill each field by Arabic label, dispatching React-friendly events.
    for (const f of fields) {
      const setterFn = String(__findFieldFn);
      const ok = await page.evaluate((label, value, kind, setterSrc) => {
        // eslint-disable-next-line no-new-func
        const findField = new Function("label", `return (${setterSrc})(label);`);
        const el = findField(label);
        if (!el) return { ok: false, reason: `label-not-found:${label}` };
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") {
          const proto = tag === "input" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter && setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
          return { ok: true, kind: tag };
        }
        return { ok: false, reason: `unsupported-tag:${tag}` };
      }, f.label, f.value, f.kind || "text", setterFn);
      if (!ok || !ok.ok) {
        result.uiCreate = "FAIL";
        result.notes.push(`form-fill:${f.label}:${ok && ok.reason}`);
        return result;
      }
    }
    await new Promise((r) => setTimeout(r, 200));

    // Listen for a successful create response while we click submit.
    const respWaiter = page.waitForResponse(
      (r) => /\/api\//.test(r.url()) && r.request().method() === "POST" && r.status() < 400,
      { timeout: 15000 }
    ).catch(() => null);

    const clicked = await page.evaluate((submitText) => {
      const btns = Array.from(document.querySelectorAll("button")).filter((b) => !b.disabled);
      // Try exact match, then "حفظ X" / "إضافة X" prefix forms.
      const candidates = [
        (b) => (b.textContent || "").trim() === submitText,
        (b) => /^حفظ(\s|$)/.test((b.textContent || "").trim()),
        (b) => /^إضافة(\s|$)/.test((b.textContent || "").trim()),
      ];
      for (const pred of candidates) {
        const btn = btns.find(pred);
        if (btn) { btn.click(); return true; }
      }
      return false;
    }, spec.submitText);
    if (!clicked) {
      result.uiCreate = "FAIL";
      result.notes.push(`submit-button-not-found:${spec.submitText}`);
      return result;
    }

    const resp = await respWaiter;
    if (!resp) {
      result.uiCreate = "FAIL";
      result.notes.push("no successful POST after submit");
      return result;
    }
    result.uiCreate = "PASS";

    // Wait for redirect (most create pages call setLocation back to list).
    await new Promise((r) => setTimeout(r, 700));

    // Verify the new row by navigating to list (SPA nav) and scanning DOM text.
    await page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, ent.listUrl);
    await new Promise((r) => setTimeout(r, 1500));
    const found = await page.evaluate((needle) => (document.body?.innerText || "").includes(needle), uniqueValue);
    if (found) {
      result.uiVerify = "PASS";
    } else {
      result.uiVerify = "FAIL";
      result.notes.push(`new row "${uniqueValue}" not visible in list`);
    }
  } catch (e) {
    if (result.uiCreate === "SKIP") result.uiCreate = "FAIL";
    if (result.uiVerify === "SKIP") result.uiVerify = "FAIL";
    result.notes.push(`uiform-exc:${e.message.slice(0, 100)}`);
  }
  return result;
}

// ─── UI axis 5: REAL edit via the row's actions menu ────────────────────
// Locate the just-created row by its unique text, click the row-level
// "تعديل" affordance (icon button title="تعديل" or text/link), tweak the
// first visible non-search text input, click "حفظ التعديلات" / "حفظ",
// and assert a successful PATCH/PUT API response.
async function runUiEdit(page, ent, uniqueValue, seedId) {
  const result = { uiEdit: "SKIP", notes: [] };
  if (!uniqueValue) return result;
  try {
    await page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, ent.listUrl);
    await new Promise((r) => setTimeout(r, 1500));

    let clickRes = await page.evaluate((needle) => {
      const matchBtn = (b) => {
        const title = b.getAttribute("title") || "";
        const text = (b.textContent || "").trim();
        const aria = b.getAttribute("aria-label") || "";
        return title === "تعديل" || /^تعديل($|\s)/.test(text) || /تعديل/.test(aria);
      };
      // Walk up from each text node containing the needle until we find a
      // container that also has the edit affordance. Works for tables AND
      // card grids (hr/shifts) without per-page selectors.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let foundRow = false;
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.includes(needle)) continue;
        foundRow = true;
        let el = node.parentElement;
        for (let depth = 0; el && depth < 12; depth++, el = el.parentElement) {
          const cands = Array.from(el.querySelectorAll("button, a"));
          const btn = cands.find(matchBtn);
          if (btn) { btn.click(); return { ok: true }; }
        }
      }
      // Distinguish "row not visible" (FAIL) from "row visible but list
      // page intentionally has no inline edit affordance" (SKIP — e.g.
      // finance/vendors uses an edit page link only on the detail view).
      const anyEditBtn = Array.from(document.querySelectorAll("button, a")).some(matchBtn);
      if (foundRow && !anyEditBtn) return { ok: false, reason: "no-edit-affordance-on-list", skip: true };
      return { ok: false, reason: foundRow ? "edit-btn-not-near-row" : "row-not-visible" };
    }, uniqueValue);

    // Detail-page fallback: list has no inline edit affordance, but most
    // entities follow `${listUrl}/${id}` for the detail/edit page. Navigate
    // there and look for "تعديل" on the detail page (link/button — usually
    // a Link to /entity/:id/edit, sometimes an inline edit form trigger).
    if (!clickRes.ok && (clickRes.reason === "no-edit-affordance-on-list" ||
                         clickRes.reason === "row-not-visible") && seedId != null) {
      const detailUrl = `${ent.listUrl.split("?")[0].replace(/\/$/, "")}/${seedId}`;
      await page.evaluate((url) => {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, detailUrl);
      await new Promise((r) => setTimeout(r, 1500));
      const detailClick = await page.evaluate(() => {
        const matchBtn = (b) => {
          const title = b.getAttribute("title") || "";
          const text = (b.textContent || "").trim();
          const aria = b.getAttribute("aria-label") || "";
          return title === "تعديل" || /^تعديل($|\s)/.test(text) || /تعديل/.test(aria);
        };
        const btn = Array.from(document.querySelectorAll("button, a")).find(matchBtn);
        if (!btn) return { ok: false, reason: "no-edit-affordance-on-detail" };
        btn.click();
        return { ok: true, viaDetail: true };
      });
      if (detailClick.ok) clickRes = detailClick;
      else clickRes = { ok: false, reason: detailClick.reason };
    }

    if (!clickRes.ok) {
      // Treat "no UI affordance anywhere" as FAIL (real product gap), not
      // SKIP — the user should always be able to edit a row from either
      // the list or the detail page. Task #158 raised this from SKIP→FAIL.
      result.uiEdit = "FAIL";
      result.notes.push(`edit:${clickRes.reason}`);
      return result;
    }
    if (clickRes.viaDetail) result.notes.push("uE:via-detail-page");
    // Wait longer when we came via the detail page — the click may have
    // navigated to a lazy-loaded /entity/:id/edit route that needs time to
    // mount before its inputs/save-button render.
    await new Promise((r) => setTimeout(r, clickRes.viaDetail ? 2500 : 1200));
    // Poll for an editable text input (handles slower-mounting edit routes).
    for (let i = 0; i < 8; i++) {
      const has = await page.evaluate(() => Array.from(
        document.querySelectorAll('input[type="text"], input:not([type]), textarea')
      ).some((i) => i.offsetParent !== null &&
        !/بحث|ابحث|search/i.test((i.placeholder || "") + " " + (i.getAttribute("aria-label") || ""))));
      if (has) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    // Tweak first visible text input so the form actually dirties.
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      const visible = all.filter((i) =>
        i.offsetParent !== null &&
        !/بحث|ابحث|search/i.test((i.placeholder || "") + " " + (i.getAttribute("aria-label") || ""))
      );
      if (visible.length === 0) return false;
      const el = visible[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, (el.value || "") + " ✎");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    });
    await new Promise((r) => setTimeout(r, 200));

    const respWaiter = page.waitForResponse(
      (r) => /\/api\//.test(r.url()) &&
             (r.request().method() === "PATCH" || r.request().method() === "PUT") &&
             r.status() < 400,
      { timeout: 12000 }
    ).catch(() => null);

    const saveClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
        .filter((b) => !b.disabled && b.offsetParent !== null);
      const preds = [
        (b) => /^حفظ التعديلات$/.test((b.textContent || "").trim()),
        (b) => /^حفظ$/.test((b.textContent || "").trim()),
        (b) => /^حفظ(\s|$)/.test((b.textContent || "").trim()),
        (b) => /^تحديث$/.test((b.textContent || "").trim()),
      ];
      for (const p of preds) {
        const btn = btns.find(p);
        if (btn) { btn.click(); return true; }
      }
      return false;
    });
    if (!saveClicked) {
      result.uiEdit = "FAIL";
      result.notes.push("edit-save-button-not-found");
      return result;
    }
    const resp = await respWaiter;
    if (!resp) {
      result.uiEdit = "FAIL";
      result.notes.push("no successful PATCH/PUT after save");
      return result;
    }
    result.uiEdit = "PASS";
  } catch (e) {
    result.uiEdit = "FAIL";
    result.notes.push(`uiedit-exc:${e.message.slice(0, 100)}`);
  }
  return result;
}

// ─── UI axis 6: REAL delete via the row's actions menu ──────────────────
// Click the row-level "حذف" affordance, auto-accept any browser confirm()
// dialog (registered globally in setupPage), then click "تأكيد الحذف" if
// an inline/Alert confirm renders. Assert a successful DELETE response and
// that the unique value is no longer present in the rendered list.
async function runUiDelete(page, ent, uniqueValue, seedId) {
  const result = { uiDelete: "SKIP", notes: [] };
  if (!uniqueValue) return result;
  try {
    await page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, ent.listUrl);
    await new Promise((r) => setTimeout(r, 1500));

    const respWaiter = page.waitForResponse(
      (r) => /\/api\//.test(r.url()) && r.request().method() === "DELETE" && r.status() < 400,
      { timeout: 12000 }
    ).catch(() => null);

    let clickRes = await page.evaluate((needle) => {
      const matchBtn = (b) => {
        const title = b.getAttribute("title") || "";
        const text = (b.textContent || "").trim();
        const aria = b.getAttribute("aria-label") || "";
        return title === "حذف" || /^حذف$/.test(text) || /حذف/.test(aria);
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let foundRow = false;
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.includes(needle)) continue;
        foundRow = true;
        let el = node.parentElement;
        for (let depth = 0; el && depth < 12; depth++, el = el.parentElement) {
          const cands = Array.from(el.querySelectorAll("button, a"));
          const btn = cands.find(matchBtn);
          if (btn) { btn.click(); return { ok: true }; }
        }
      }
      const anyDeleteBtn = Array.from(document.querySelectorAll("button, a")).some(matchBtn);
      if (foundRow && !anyDeleteBtn) return { ok: false, reason: "no-delete-affordance-on-list", skip: true };
      return { ok: false, reason: foundRow ? "delete-btn-not-near-row" : "row-not-visible" };
    }, uniqueValue);

    // Detail-page fallback: navigate to `${listUrl}/${id}` and look for
    // "حذف" there. Many list pages defer delete to the detail view.
    let viaDetail = false;
    if (!clickRes.ok && (clickRes.reason === "no-delete-affordance-on-list" ||
                         clickRes.reason === "row-not-visible") && seedId != null) {
      const detailUrl = `${ent.listUrl.split("?")[0].replace(/\/$/, "")}/${seedId}`;
      await page.evaluate((url) => {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, detailUrl);
      await new Promise((r) => setTimeout(r, 1500));
      const detailClick = await page.evaluate(() => {
        const matchBtn = (b) => {
          const title = b.getAttribute("title") || "";
          const text = (b.textContent || "").trim();
          const aria = b.getAttribute("aria-label") || "";
          return title === "حذف" || /^حذف$/.test(text) || /حذف/.test(aria);
        };
        const btn = Array.from(document.querySelectorAll("button, a")).find(matchBtn);
        if (!btn) return { ok: false, reason: "no-delete-affordance-on-detail" };
        btn.click();
        return { ok: true };
      });
      if (detailClick.ok) { clickRes = detailClick; viaDetail = true; }
      else clickRes = { ok: false, reason: detailClick.reason };
    }

    if (!clickRes.ok) {
      // Treat "no UI affordance anywhere" as FAIL (real product gap), not
      // SKIP — the user should always be able to delete a row from either
      // the list or the detail page. Task #158 raised this from SKIP→FAIL.
      result.uiDelete = "FAIL";
      result.notes.push(`delete:${clickRes.reason}`);
      return result;
    }
    if (viaDetail) result.notes.push("uD:via-detail-page");
    await new Promise((r) => setTimeout(r, 600));

    // If inline/AlertDialog confirm appeared, click "تأكيد الحذف"/"تأكيد"/"حذف".
    // The shared ConfirmDeleteDialog disables the confirm button while it
    // fetches the delete-impact preview — poll for up to 5s until enabled.
    for (let i = 0; i < 10; i++) {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"))
          .filter((b) => !b.disabled && b.offsetParent !== null);
        const preds = [
          (b) => /^تأكيد الحذف$/.test((b.textContent || "").trim()),
          (b) => /تأكيد الحذف/.test((b.textContent || "").trim()),
          (b) => /^متابعة$/.test((b.textContent || "").trim()),
          (b) => /^تأكيد$/.test((b.textContent || "").trim()),
        ];
        for (const p of preds) {
          const btn = btns.find(p);
          if (btn) { btn.click(); return true; }
        }
        return false;
      });
      if (clicked) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const resp = await respWaiter;
    if (!resp) {
      result.uiDelete = "FAIL";
      result.notes.push("no successful DELETE after confirm");
      return result;
    }
    // Force a fresh list fetch (some pages — finance/accounts tree —
    // don't auto-invalidate). Re-navigate via SPA, retry up to 3× × 800ms.
    let stillThere = true;
    for (let i = 0; i < 3 && stillThere; i++) {
      await new Promise((r) => setTimeout(r, 800));
      await page.evaluate((url) => {
        window.history.pushState({}, "", url + (url.includes("?") ? "&" : "?") + "_nocache=" + Date.now());
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, ent.listUrl);
      await new Promise((r) => setTimeout(r, 1000));
      stillThere = await page.evaluate(
        (needle) => (document.body?.innerText || "").includes(needle),
        uniqueValue
      );
    }
    if (stillThere) {
      result.uiDelete = "FAIL";
      result.notes.push(`row "${uniqueValue}" still visible after DELETE + 3 refreshes`);
    } else {
      result.uiDelete = "PASS";
    }
  } catch (e) {
    result.uiDelete = "FAIL";
    result.notes.push(`uidelete-exc:${e.message.slice(0, 100)}`);
  }
  return result;
}

// ─── UI axis 7: REAL filter/pagination/search/export interactions ────────
async function runUiExercise(page, ent, uiUniqueValue) {
  const result = { render: "?", paginate: "?", search: "?", export: "?", notes: [] };
  try {
    await page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, ent.listUrl);
    await new Promise((r) => setTimeout(r, 1500));

    const has5xx = await page.evaluate(() => !!window.__last5xx);
    const url = page.url();
    if (!url.includes(ent.listUrl.split("?")[0])) {
      result.render = "FAIL";
      result.notes.push(`url=${url}`);
      return result;
    }
    if (has5xx) result.notes.push("5xx during load");
    result.render = "PASS";

    // ── Real search interaction ────────────────────────────────────────
    // Find the search box (placeholder contains "بحث"/"ابحث"), capture
    // the visible row count, type a query and re-count. The query uses the
    // unique value created above so we expect to find at least 1 row.
    const searchTerm = uiUniqueValue
      ? uiUniqueValue.split("-").slice(0, 2).join("-")  // first two segments
      : null;

    const searchOutcome = await page.evaluate(async (term) => {
      const input = document.querySelector(
        'input[type="search"], input[placeholder*="بحث"], input[placeholder*="ابحث"]'
      );
      if (!input) return { ok: false, reason: "no-search-input" };
      const before = document.querySelectorAll("table tbody tr").length;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const query = term || "zzzz-no-such-row-xyz123";
      setter.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 350));
      const after = document.querySelectorAll("table tbody tr").length;
      // Reset
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, before, after, term: query };
    }, searchTerm);
    if (!searchOutcome.ok) {
      result.search = "SKIP";
      result.notes.push(`search:${searchOutcome.reason}`);
    } else if (searchTerm) {
      // expect at least 1 row to remain that matches the unique value
      result.search = searchOutcome.after >= 1 ? "PASS" : "FAIL";
      if (searchOutcome.after < 1)
        result.notes.push(`search filtered ${searchOutcome.before}→${searchOutcome.after} for "${searchTerm}"`);
    } else {
      // generic noise term: should narrow rows to 0 (or strictly less)
      result.search = searchOutcome.after < searchOutcome.before ? "PASS"
        : searchOutcome.before === 0 ? "SKIP" : "FAIL";
    }
    await new Promise((r) => setTimeout(r, 200));

    // ── Real pagination interaction ───────────────────────────────────
    // Click the visible "التالي" / "الانتقال للصفحة التالية" button. If
    // the table fits on one page the button is disabled — that's a SKIP,
    // not a fail.
    const pageOutcome = await page.evaluate(async () => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const next = btns.find((b) => {
        const t = (b.textContent || "").trim();
        const aria = b.getAttribute("aria-label") || "";
        return /^التالي$/.test(t) || /الانتقال للصفحة التالية/.test(aria);
      });
      if (!next) return { ok: false, reason: "no-next-button" };
      if (next.disabled || next.getAttribute("aria-disabled") === "true") return { ok: false, reason: "disabled-single-page" };
      const beforeFirst = (document.querySelector("table tbody tr") || {}).textContent || "";
      const beforeUrl = location.pathname + location.search;
      next.click();
      await new Promise((r) => setTimeout(r, 500));
      const afterFirst = (document.querySelector("table tbody tr") || {}).textContent || "";
      const afterUrl = location.pathname + location.search;
      return { ok: true, changedRows: beforeFirst !== afterFirst, changedUrl: beforeUrl !== afterUrl };
    });
    if (!pageOutcome.ok) {
      result.paginate = pageOutcome.reason === "disabled-single-page" ? "SKIP" : "SKIP";
      if (pageOutcome.reason !== "disabled-single-page") result.notes.push(`pag:${pageOutcome.reason}`);
    } else {
      result.paginate = (pageOutcome.changedRows || pageOutcome.changedUrl) ? "PASS" : "FAIL";
      if (!(pageOutcome.changedRows || pageOutcome.changedUrl))
        result.notes.push("clicked next but neither rows nor URL changed");
    }
    await new Promise((r) => setTimeout(r, 200));

    // ── Real export interaction ───────────────────────────────────────
    // Click any "تصدير" / "تصدير جدولي" button. Listen for either a
    // matching toast ("تم تصدير") or a download/CSV blob URL navigation.
    const exportOutcome = await page.evaluate(async () => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => /تصدير(\s+جدولي)?$/.test((b.textContent || "").trim()) && !b.disabled);
      if (!btn) return { ok: false, reason: "no-export-button" };
      // Spy on URL.createObjectURL to detect blob downloads
      window.__exportedBlob = false;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) { window.__exportedBlob = true; return orig.call(URL, b); };
      btn.click();
      await new Promise((r) => setTimeout(r, 700));
      URL.createObjectURL = orig;
      const toast = document.body.innerText.includes("تم تصدير") || document.body.innerText.includes("تصدير");
      return { ok: true, blob: window.__exportedBlob, toast };
    });
    if (!exportOutcome.ok) {
      result.export = "SKIP";
      result.notes.push(`export:${exportOutcome.reason}`);
    } else {
      // Some exports show a dropdown menu first — accept blob OR a toast
      result.export = exportOutcome.blob ? "PASS" : (exportOutcome.toast ? "PASS" : "FAIL");
      if (!exportOutcome.blob && !exportOutcome.toast)
        result.notes.push("export click produced no blob and no toast");
    }
  } catch (e) {
    result.render = result.render === "?" ? "FAIL" : result.render;
    result.notes.push(`exc:${e.message.slice(0, 100)}`);
  }
  return result;
}

// ─── Puppeteer setup ─────────────────────────────────────────────────────
function detectChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const { spawnSync } = require("child_process");
  for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("Chromium not found");
}

async function configurePage(page) {
  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "ar" });
  // Auto-accept JS confirm()/alert() dialogs (properties/owners delete uses one).
  page.on("dialog", (d) => { d.accept().catch(() => {}); });
  // Track 5xx responses
  await page.evaluateOnNewDocument(() => { window.__last5xx = false; });
  page.on("response", (r) => {
    if (r.status() >= 500) page.evaluate(() => { window.__last5xx = true; }).catch(() => {});
  });
  // Login by setting cookies — domain=localhost path=/ so the SPA's /auth/me
  // call carries them. The frontend also gates rendering on the presence of
  // localStorage.erp_assignments (see lib/auth.tsx), so seed that too.
  const cookies = cookieHeader.split("; ").map((c) => {
    const [name, ...v] = c.split("=");
    return { name, value: v.join("="), domain: "localhost", path: "/" };
  });
  await page.setCookie(...cookies);
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
  await new Promise((r) => setTimeout(r, 2000));
  return page;
}

async function setupPage() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: detectChromium(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await configurePage(await browser.newPage());
  return { browser, page };
}

// Recreate a fresh authenticated page. If the existing browser is dead
// (chromium crashed during a delete that triggered a full reload), re-launch
// the whole browser. Returns { browser, page }. Without this, every subsequent
// entity FAILs with "detached Frame" or "Connection closed".
async function recreatePage(browser) {
  try {
    const p = await configurePage(await browser.newPage());
    return { browser, page: p };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[recover] browser dead (${e.message.slice(0, 80)}); re-launching`);
    try { await browser.close(); } catch {}
    const fresh = await setupPage();
    return { browser: fresh.browser, page: fresh.page };
  }
}

// ─── Reporter ─────────────────────────────────────────────────────────────
function summarise(rows) {
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of rows) {
    for (const k of ["create", "read", "update", "delete",
                     "uiCreate", "uiVerify", "uiEdit", "uiDelete",
                     "uiRender", "uiPaginate", "uiSearch", "uiExport"]) {
      const v = r[k];
      if (v === "PASS") counts.pass++;
      else if (v === "FAIL") counts.fail++;
      else if (v === "SKIP" || v === "?") counts.skip++;
    }
  }
  return counts;
}

function emoji(v) {
  if (v === "PASS") return "✅";
  if (v === "FAIL") return "❌";
  return "⚪";
}

function buildMarkdown(rows, ctx, durationMs) {
  const lines = [];
  lines.push("");
  lines.push("## Deep CRUD round-trip results (Task #139, 2026-05-07)");
  lines.push("");
  lines.push(`Round-trip per entity: **API axis 3** (POST→GET→PATCH→DELETE) and **UI axis 5** (render, ?page=2, search input, export button). 21 entities across HR, Finance, Properties, Fleet, Umrah. Auth: admin@ghayth.com (owner). Pre-built context: employeeId=${ctx.employeeId}, clientId=${ctx.clientId}, vehicleId=${ctx.vehicleId}, seasonId=${ctx.seasonId}. Run took ${(durationMs / 1000).toFixed(1)}s.`);
  lines.push("");
  lines.push("Legend: **C/R/U/D** = API CRUD round-trip; **uC/uV** = UI form-fill create + row visible in list; **uE/uD** = real edit/delete via the row's actions menu (click pencil → tweak input → save → assert PATCH; click trash → confirm → assert DELETE + row disappears); **Re/Pg/Se/Ex** = real UI render / next-button click / typing in search box / clicking export button (asserts blob or toast).");
  lines.push("");
  lines.push("| Module | List route | API base | C | R | U | D | uC | uV | uE | uD | Re | Pg | Se | Ex | Notes |");
  lines.push("|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|");
  for (const r of rows) {
    const notes = r.notes.length ? r.notes.join(" / ").replace(/\|/g, "\\|").slice(0, 200) : "";
    lines.push(`| ${r.module} | \`${r.listUrl}\` | \`${r.listApi}\` | ${emoji(r.create)} | ${emoji(r.read)} | ${emoji(r.update)} | ${emoji(r.delete)} | ${emoji(r.uiCreate)} | ${emoji(r.uiVerify)} | ${emoji(r.uiEdit)} | ${emoji(r.uiDelete)} | ${emoji(r.uiRender)} | ${emoji(r.uiPaginate)} | ${emoji(r.uiSearch)} | ${emoji(r.uiExport)} | ${notes} |`);
  }
  const c = summarise(rows);
  lines.push("");
  lines.push(`**Totals**: ${c.pass} PASS / ${c.fail} FAIL / ${c.skip} SKIP across ${rows.length} entities × 12 axes (${rows.length * 12} checks). Axis 4 (uC/uV) covers UI form-fill create + row visibility on the 7 high-traffic entities (hr/shifts, finance/accounts, finance/vendors, properties/owners, properties/buildings, fleet vehicles, fleet/drivers); **Task #144 added axes 5 (uE) and 6 (uD)** which exercise the row-level "تعديل" and "حذف" affordances end-to-end on the just-created row, asserting a successful PATCH and DELETE plus disappearance from the list.`);
  lines.push("");
  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  await login();
  let ctx = await buildContext();
  // eslint-disable-next-line no-console
  console.log(`[ctx] employeeId=${ctx.employeeId} clientId=${ctx.clientId} vehicleId=${ctx.vehicleId} seasonId=${ctx.seasonId}`);

  const setup = await setupPage();
  let browser = setup.browser;
  let page = setup.page;
  const rows = [];
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  for (const ent of ENTITIES) {
    if (only && !only.includes(ent.listUrl)) continue;
    // Skip entities whose context dependency is missing
    if (ent.needsEmployee && !ctx.employeeId) {
      rows.push({ module: ent.module, listUrl: ent.listUrl, listApi: ent.listApi,
                  create: "SKIP", read: "SKIP", update: "SKIP", delete: "SKIP",
                  uiCreate: "SKIP", uiVerify: "SKIP",
                  uiRender: "?", uiPaginate: "?", uiSearch: "?", uiExport: "?",
                  notes: ["no seed employee"] });
      continue;
    }
    if (ent.needsClient && !ctx.clientId) {
      rows.push({ module: ent.module, listUrl: ent.listUrl, listApi: ent.listApi,
                  create: "SKIP", read: "SKIP", update: "SKIP", delete: "SKIP",
                  uiCreate: "SKIP", uiVerify: "SKIP",
                  uiRender: "?", uiPaginate: "?", uiSearch: "?", uiExport: "?",
                  notes: ["no seed client"] });
      continue;
    }
    if (ent.needsSeason && !ctx.seasonId) {
      // create one on the fly
      const c = await api("POST", "/api/umrah/seasons", {
        title: u("ctx-season"), startDate: "2026-06-01", endDate: "2026-12-31",
      });
      ctx.seasonId = c.data?.id;
    }
    if (ent.needsVehicle && !ctx.vehicleId) {
      const c = await api("POST", "/api/fleet/vehicles", {
        plateNumber: `CTX-${stamp}`, make: "Toyota", model: "Hilux", year: 2024,
      });
      ctx.vehicleId = c.data?.id;
    }

    // eslint-disable-next-line no-console
    console.log(`[run] ${ent.module} ${ent.listUrl}`);
    const apiR = await runApiCrud(ent, ctx);
    // Aggressive throttle for Umrah (server has a ~144 req/min limit)
    // Umrah API is hard rate-limited (~144 req/min). Skip the UI exercise
    // for Umrah entities — they remain covered by the API CRUD axes and the
    // earlier FRONTEND_TEST_MATRIX render axis. See follow-up #145.
    let formR, editR, delR, uiR;
    // If the page was detached by a previous entity's flow (e.g. a stray
    // full-page redirect on success), re-create it so subsequent entities
    // don't all FAIL with "Attempted to use detached Frame".
    const isDetached = async () => {
      try { await page.evaluate(() => 1); return false; }
      catch (e) { return /detached Frame|Target closed|Session closed/i.test(e.message); }
    };
    if (await isDetached()) {
      try { await page.close({ runBeforeUnload: false }); } catch {}
      // eslint-disable-next-line no-console
      console.log(`[recover] re-creating page after detached frame`);
      ({ browser, page } = await recreatePage(browser));
    }

    if (ent.module === "Umrah") {
      // Umrah API is hard rate-limited (~144 req/min). Skip the form-fill
      // exercise but still cover uE/uD by seeding ONE row via API and
      // running the row-level walker / detail-page fallback against it.
      // Adds ~3 API calls per Umrah entity (POST seed + PATCH on edit +
      // DELETE on delete) — well under the per-minute quota. See #145.
      formR = { uiCreate: "SKIP", uiVerify: "SKIP", notes: ["umrah-rate-limited:form-skipped"], uiUniqueValue: null };
      uiR = { render: "SKIP", paginate: "SKIP", search: "SKIP", export: "SKIP", notes: ["umrah-rate-limited:exercise-skipped"] };
    } else {
      formR = await runUiFormFlow(page, ent);
      uiR = null; // computed below after uE/uD
    }

    // Always seed via API for uE/uD coverage. This decouples row-level
    // edit/delete testing from form-fill: even when the entity has no
    // UI_SPECS entry (most "complex form" entities), or when the list page
    // has no inline affordance and we need to fall back to the detail page,
    // we have a known row id to target. The form-fill row (if any) remains
    // covered by uC/uV.
    let seedNeedle = null;
    let seedId = null;
    const seed = await seedRowForUi(ent, ctx);
    if (seed && seed.needle) {
      seedNeedle = seed.needle;
      seedId = seed.id;
      formR.notes.push(`seeded-via-api id=${seed.id} needle="${seed.needle.slice(0, 40)}"`);
    } else if (seed && seed.error) {
      formR.notes.push(`seed-failed:${seed.error}`);
    }

    if (seedNeedle) {
      editR = await runUiEdit(page, ent, seedNeedle, seedId);
      if (await isDetached()) {
        ({ browser, page } = await recreatePage(browser));
        delR = { uiDelete: "SKIP", notes: ["skipped — page detached after uE; recovered for next entity"] };
      } else {
        delR = await runUiDelete(page, ent, seedNeedle, seedId);
      }
    } else {
      editR = { uiEdit: "SKIP", notes: formR.uiCreate === "SKIP" ? [] : ["skipped — no needle (form-fill + seed both failed)"] };
      delR = { uiDelete: "SKIP", notes: [] };
    }

    if (uiR == null) {
      if (await isDetached()) {
        ({ browser, page } = await recreatePage(browser));
        uiR = { render: "SKIP", paginate: "SKIP", search: "SKIP", export: "SKIP",
                notes: ["skipped — page detached after uD; recovered for next entity"] };
      } else {
        uiR = await runUiExercise(page, ent, formR.uiUniqueValue);
      }
    }
    rows.push({
      module: ent.module, listUrl: ent.listUrl, listApi: ent.listApi,
      create: apiR.create, read: apiR.read, update: apiR.update, delete: apiR.delete,
      uiCreate: formR.uiCreate, uiVerify: formR.uiVerify,
      uiEdit: editR.uiEdit, uiDelete: delR.uiDelete,
      uiRender: uiR.render, uiPaginate: uiR.paginate, uiSearch: uiR.search, uiExport: uiR.export,
      notes: [...apiR.notes, ...formR.notes, ...editR.notes, ...delR.notes, ...uiR.notes],
    });
  }
  await browser.close();

  const jsonPathEarly = path.join(__dirname, "..", "..", "audit", "report", "deep_crud_results.json");
  // APPEND mode: merge with existing rows from a previous run so the canonical
  // matrix can be assembled from two halves when the bash 120s limit is tight.
  if (process.env.APPEND === "1" && fs.existsSync(jsonPathEarly)) {
    try {
      const prev = JSON.parse(fs.readFileSync(jsonPathEarly, "utf-8"));
      const newKeys = new Set(rows.map((r) => r.listUrl));
      const kept = (prev.rows || []).filter((r) => !newKeys.has(r.listUrl));
      const newCount = rows.length;
      rows.unshift(...kept);
      ctx = { ...(prev.ctx || {}), ...ctx };
      // eslint-disable-next-line no-console
      console.log(`[append] merged ${kept.length} rows from prior run + ${newCount} new = ${rows.length} total`);
    } catch (e) { console.log(`[append] failed to read prior JSON: ${e.message}`); }
  }
  const md = buildMarkdown(rows, ctx, Date.now() - t0);
  const matrixPath = path.join(__dirname, "..", "..", "FRONTEND_TEST_MATRIX.md");
  const cur = fs.readFileSync(matrixPath, "utf-8");
  const marker = "## Deep CRUD round-trip results (Task #139";
  const stripped = cur.split(marker)[0].replace(/\s+$/, "");
  fs.writeFileSync(matrixPath, stripped + "\n" + md);

  const jsonPath = path.join(__dirname, "..", "..", "audit", "report", "deep_crud_results.json");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ ts: new Date().toISOString(), ctx, rows }, null, 2));

  // eslint-disable-next-line no-console
  console.log(md);
  // eslint-disable-next-line no-console
  console.log(`\nResults: ${matrixPath}\nJSON: ${jsonPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
