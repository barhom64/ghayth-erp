/**
 * brandedThemes — multi-variant default clichés with Ghayth brand identity.
 *
 * The print editor's "preset" tab offers three visual styles (classic /
 * modern / compact). Before this module those keys were dead — the backend
 * always returned the single hard-coded `invoice_classic` HTML regardless
 * of which theme the operator picked. This module makes the choice real:
 * each (entityType, themeKey) pair maps to a distinct, fully-branded HTML
 * body that the resolver + preview path can serve.
 *
 * Themes share the same {{tokens}} so the data loader / variable
 * substitution layer is unchanged — only the visual chrome differs:
 *
 *   - classic : navy header bar, bordered tables, formal. The safe default.
 *   - modern  : teal accent band, borderless zebra rows, airy spacing.
 *   - compact : dense, small type, thin rules — fits more lines per page.
 *
 * Brand palette (from the official Ghayth sheet):
 *   teal   #3FBFD9   navy   #0F3D5C   ink #0f172a   muted #64748b
 *
 * These are FALLBACK templates: the moment a company saves its own
 * template (or uploads a cliché), `resolveTemplate` prefers that. This
 * module only feeds the seeded-default + preview paths.
 */

export type ThemeKey = "classic" | "modern" | "compact";

const BRAND = {
  teal: "#3FBFD9",
  navy: "#0F3D5C",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#cbd5e1",
  tealSoft: "#eaf7fb",
  naviSoft: "#eef2f6",
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  classic: "كلاسيكي",
  modern: "عصري",
  compact: "مدمج",
};

export const THEME_KEYS: ThemeKey[] = ["classic", "modern", "compact"];

function isTheme(k: string | null | undefined): k is ThemeKey {
  return k === "classic" || k === "modern" || k === "compact";
}

// ─── Invoice ────────────────────────────────────────────────────────────────

function invoiceItemsHead(theme: ThemeKey): string {
  if (theme === "modern") {
    return `<tr style="background:${BRAND.navy};color:#fff">
      <th style="padding:8px 10px;text-align:center;width:32px;font-size:10pt">#</th>
      <th style="padding:8px 10px;text-align:right;font-size:10pt">البيان</th>
      <th style="padding:8px 10px;width:70px;font-size:10pt">الكمية</th>
      <th style="padding:8px 10px;width:100px;font-size:10pt">سعر الوحدة</th>
      <th style="padding:8px 10px;width:90px;font-size:10pt">الضريبة</th>
      <th style="padding:8px 10px;width:110px;font-size:10pt">الإجمالي</th>
    </tr>`;
  }
  const bg = theme === "compact" ? BRAND.naviSoft : "#f1f5f9";
  const pad = theme === "compact" ? "4px 6px" : "6px";
  const fs = theme === "compact" ? "9pt" : "10pt";
  const border = `border:1px solid ${BRAND.line};`;
  return `<tr style="background:${bg}">
    <th style="${border}padding:${pad};font-size:${fs};width:32px">#</th>
    <th style="${border}padding:${pad};font-size:${fs};text-align:right">البيان</th>
    <th style="${border}padding:${pad};font-size:${fs};width:70px">الكمية</th>
    <th style="${border}padding:${pad};font-size:${fs};width:100px">سعر الوحدة</th>
    <th style="${border}padding:${pad};font-size:${fs};width:90px">الضريبة</th>
    <th style="${border}padding:${pad};font-size:${fs};width:110px">الإجمالي</th>
  </tr>`;
}

function invoiceItemsRow(theme: ThemeKey): string {
  if (theme === "modern") {
    // Zebra striping via nth-child handled in CSS; here just clean cells.
    return `<tr>
      <td style="padding:7px 10px;font-size:10pt;text-align:center;border-bottom:1px solid #e2e8f0">{{@index}}</td>
      <td style="padding:7px 10px;font-size:10pt;border-bottom:1px solid #e2e8f0">{{this.description}}</td>
      <td style="padding:7px 10px;font-size:10pt;text-align:center;border-bottom:1px solid #e2e8f0">{{this.quantity}}</td>
      <td style="padding:7px 10px;font-size:10pt;text-align:left;border-bottom:1px solid #e2e8f0">{{this.unitPrice}}</td>
      <td style="padding:7px 10px;font-size:10pt;text-align:left;border-bottom:1px solid #e2e8f0">{{this.vatAmount}}</td>
      <td style="padding:7px 10px;font-size:10pt;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600">{{this.totalPrice}}</td>
    </tr>`;
  }
  const pad = theme === "compact" ? "4px 6px" : "6px";
  const fs = theme === "compact" ? "9pt" : "10pt";
  const b = `border:1px solid ${BRAND.line};`;
  return `<tr>
    <td style="${b}padding:${pad};font-size:${fs};text-align:center">{{@index}}</td>
    <td style="${b}padding:${pad};font-size:${fs}">{{this.description}}</td>
    <td style="${b}padding:${pad};font-size:${fs};text-align:center">{{this.quantity}}</td>
    <td style="${b}padding:${pad};font-size:${fs};text-align:left">{{this.unitPrice}}</td>
    <td style="${b}padding:${pad};font-size:${fs};text-align:left">{{this.vatAmount}}</td>
    <td style="${b}padding:${pad};font-size:${fs};text-align:left">{{this.totalPrice}}</td>
  </tr>`;
}

function invoiceTitleBlock(theme: ThemeKey): string {
  if (theme === "modern") {
    return `<div style="background:linear-gradient(90deg,${BRAND.teal},${BRAND.navy});color:#fff;border-radius:8px;padding:12px 18px;margin:14px 0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:17pt;font-weight:700">فاتورة ضريبية</span>
      <span style="font-size:10pt;opacity:.9">Tax Invoice</span>
    </div>`;
  }
  if (theme === "compact") {
    return `<h2 style="text-align:center;margin:10px 0 4px 0;padding-bottom:5px;border-bottom:2px solid ${BRAND.teal};font-size:14pt;color:${BRAND.navy}">فاتورة ضريبية</h2>`;
  }
  return `<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:3px solid ${BRAND.navy};font-size:16pt;color:${BRAND.navy}">فاتورة ضريبية</h2>`;
}

function invoicePartiesBlock(theme: ThemeKey): string {
  if (theme === "modern") {
    return `<table style="width:100%;margin-bottom:14px;border-collapse:separate;border-spacing:8px 0">
  <tr>
    <td style="vertical-align:top;width:50%;background:${BRAND.tealSoft};border-radius:8px;padding:10px 12px">
      <div style="font-weight:700;margin-bottom:4px;color:${BRAND.navy}">العميل</div>
      <div>{{client.name}}</div>
      <div style="color:${BRAND.muted};font-size:9pt">الرقم الضريبي: {{client.taxNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;background:${BRAND.naviSoft};border-radius:8px;padding:10px 12px;text-align:left">
      <div><strong>المرجع:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>تاريخ الاستحقاق:</strong> {{entity.dueDate}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>`;
  }
  const pad = theme === "compact" ? "0 4px" : "0 6px";
  return `<table style="width:100%;margin-bottom:${theme === "compact" ? "8px" : "14px"};border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:${pad}">
      <div style="font-weight:bold;margin-bottom:4px;color:${BRAND.navy}">العميل</div>
      <div>{{client.name}}</div>
      <div style="color:${BRAND.muted};font-size:9pt">الرقم الضريبي: {{client.taxNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:${pad};text-align:left">
      <div><strong>المرجع:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>تاريخ الاستحقاق:</strong> {{entity.dueDate}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>`;
}

function invoiceTotalsBlock(theme: ThemeKey): string {
  const grandBg = theme === "modern" ? BRAND.navy : "#f1f5f9";
  const grandColor = theme === "modern" ? "#fff" : BRAND.ink;
  const b = `border:1px solid ${BRAND.line};`;
  const pad = theme === "compact" ? "3px 8px" : "4px 8px";
  return `<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse;margin-top:12px">
  <tr><td style="padding:${pad};${b}">المجموع قبل الضريبة</td><td style="padding:${pad};${b};text-align:left">{{entity.subtotal}} {{entity.currency}}</td></tr>
  <tr><td style="padding:${pad};${b}">ضريبة القيمة المضافة ({{entity.vatRate}}%)</td><td style="padding:${pad};${b};text-align:left">{{entity.vatAmount}} {{entity.currency}}</td></tr>
  <tr style="background:${grandBg};color:${grandColor};font-weight:bold"><td style="padding:6px 8px;${b}">الإجمالي شامل الضريبة</td><td style="padding:6px 8px;${b};text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
  <tr><td style="padding:${pad};${b}">المدفوع</td><td style="padding:${pad};${b};text-align:left">{{entity.paidAmount}} {{entity.currency}}</td></tr>
</table>`;
}

function buildInvoiceTheme(theme: ThemeKey): string {
  return `<div class="print-doc">
{{branch.letterhead}}
${invoiceTitleBlock(theme)}
${invoicePartiesBlock(theme)}
<table style="width:100%;border-collapse:collapse;margin-bottom:${theme === "compact" ? "8px" : "14px"}">
  <thead>${invoiceItemsHead(theme)}</thead>
  <tbody>
    {{#each items}}
    ${invoiceItemsRow(theme)}
    {{/each}}
  </tbody>
</table>
${invoiceTotalsBlock(theme)}
<div style="margin-top:${theme === "compact" ? "10px" : "18px"};font-size:${theme === "compact" ? "9pt" : "10pt"};color:#475569">{{entity.notes}}</div>
<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
  <div style="flex:1">{{system.verifyBlock}}</div>
  <div style="text-align:center">
    {{entity.zatcaQr}}
    <div style="font-size:8pt;color:${BRAND.muted};margin-top:4px;font-weight:600">رمز QR — هيئة الزكاة والضريبة</div>
  </div>
</div>
{{branch.footer}}
</div>`;
}

// ─── Generic document (quotation / order / voucher / report fallback) ────────

function buildGenericTheme(theme: ThemeKey, titleToken = "{{entity.title}}"): string {
  const titleBlock =
    theme === "modern"
      ? `<div style="background:linear-gradient(90deg,${BRAND.teal},${BRAND.navy});color:#fff;border-radius:8px;padding:10px 16px;margin:14px 0;font-size:15pt;font-weight:700">${titleToken}</div>`
      : `<h2 style="text-align:center;margin:${theme === "compact" ? "10px" : "16px"} 0;padding-bottom:6px;border-bottom:${theme === "compact" ? "2px" : "3px"} solid ${theme === "compact" ? BRAND.teal : BRAND.navy};color:${BRAND.navy};font-size:${theme === "compact" ? "13pt" : "15pt"}">${titleToken}</h2>`;
  return `<div class="print-doc">
{{branch.letterhead}}
${titleBlock}
<div class="meta-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:10px 0">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
}

// ─── Per-theme CSS overrides (modern zebra striping, compact density) ────────

function themeCss(theme: ThemeKey): string {
  if (theme === "modern") {
    return `tbody tr:nth-child(even){background:${BRAND.tealSoft}}`;
  }
  if (theme === "compact") {
    return `body{font-size:10pt;line-height:1.4}`;
  }
  return "";
}

/**
 * Returns the branded HTML body for a given entity + theme. Falls back to
 * classic theme for unknown keys, and to the generic document layout for
 * any entity that doesn't have a bespoke branded layout yet.
 */
export function getBrandedThemeHtml(
  entityType: string,
  presetKey: string | null | undefined,
): { html: string; css: string; theme: ThemeKey } {
  const theme: ThemeKey = isTheme(presetKey) ? presetKey : "classic";
  const css = themeCss(theme);
  // Invoice keeps its dedicated bespoke layout (ZATCA QR, VAT totals).
  if (entityType === "invoice" || entityType === "sales_invoice") {
    return { html: buildInvoiceTheme(theme), css, theme };
  }
  // Everything else routes through the composable family system below,
  // which gives each document type a layout appropriate to its shape —
  // line-item docs, vouchers, statements, journals, payslips, letters —
  // all in the three Ghayth themes. Unknown types fall back to a branded
  // generic record.
  const recipe = DOC_RECIPES[entityType];
  if (recipe) {
    return { html: buildFromRecipe(recipe, theme), css, theme };
  }
  return { html: buildGenericTheme(theme), css, theme };
}

// ════════════════════════════════════════════════════════════════════════════
// Composable section library + per-family document recipes.
//
// Rather than hand-write 140 × 3 templates, we assemble each document from
// theme-aware section builders. A `DocRecipe` declares the document title and
// the ordered sections it needs; `buildFromRecipe` renders them for the chosen
// theme. This keeps every doc type visually consistent with the brand while
// respecting its structural shape.
// ════════════════════════════════════════════════════════════════════════════

interface DocRecipe {
  title: string;
  sections: SectionSpec[];
}

type SectionSpec =
  | { kind: "parties"; leftLabel: string; rightFields: Array<[string, string]> }
  | { kind: "metaGrid"; fields: Array<[string, string]> }
  | { kind: "itemsTable"; columns: Array<{ label: string; token: string; width?: string; align?: "right" | "center" | "left" }> }
  | { kind: "linesTable" } // generic {{entity.linesTable}} auto-builder
  | { kind: "amountBox"; amountToken: string; wordsToken?: string }
  | { kind: "totals"; rows: Array<{ label: string; token: string; grand?: boolean }> }
  | { kind: "bodyText"; token: string }
  | { kind: "signature"; parties: string[] }
  | { kind: "zatcaQr" }
  | { kind: "verify" }
  | { kind: "spacer" };

// ─── Section renderers (theme-aware) ─────────────────────────────────────────

function secTitle(title: string, theme: ThemeKey): string {
  if (theme === "modern") {
    return `<div style="background:linear-gradient(90deg,${BRAND.teal},${BRAND.navy});color:#fff;border-radius:8px;padding:11px 18px;margin:14px 0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:16pt;font-weight:700">${title}</span>
    </div>`;
  }
  if (theme === "compact") {
    return `<h2 style="text-align:center;margin:10px 0 4px;padding-bottom:5px;border-bottom:2px solid ${BRAND.teal};font-size:13pt;color:${BRAND.navy}">${title}</h2>`;
  }
  return `<h2 style="text-align:center;margin:16px 0 4px;padding-bottom:8px;border-bottom:3px solid ${BRAND.navy};font-size:15pt;color:${BRAND.navy}">${title}</h2>`;
}

function secParties(s: Extract<SectionSpec, { kind: "parties" }>, theme: ThemeKey): string {
  const right = s.rightFields.map(([l, t]) => `<div><strong>${l}:</strong> ${t}</div>`).join("\n      ");
  if (theme === "modern") {
    return `<table style="width:100%;margin-bottom:14px;border-collapse:separate;border-spacing:8px 0">
  <tr>
    <td style="vertical-align:top;width:50%;background:${BRAND.tealSoft};border-radius:8px;padding:10px 12px">
      <div style="font-weight:700;margin-bottom:4px;color:${BRAND.navy}">${s.leftLabel}</div>
      <div>{{entity.partyName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;background:${BRAND.naviSoft};border-radius:8px;padding:10px 12px;text-align:left">
      ${right}
    </td>
  </tr>
</table>`;
  }
  const pad = theme === "compact" ? "0 4px" : "0 6px";
  return `<table style="width:100%;margin-bottom:${theme === "compact" ? "8px" : "14px"};border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:${pad}">
      <div style="font-weight:bold;margin-bottom:4px;color:${BRAND.navy}">${s.leftLabel}</div>
      <div>{{entity.partyName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:${pad};text-align:left">
      ${right}
    </td>
  </tr>
</table>`;
}

function secMetaGrid(s: Extract<SectionSpec, { kind: "metaGrid" }>, theme: ThemeKey): string {
  const cells = s.fields.map(([l, t]) => `  <div><strong>${l}:</strong> ${t}</div>`).join("\n");
  const bg = theme === "modern" ? `background:${BRAND.tealSoft};border-radius:8px;padding:10px 12px;` : "";
  return `<div class="meta-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:10px 0;${bg}">
${cells}
</div>`;
}

function secItemsTable(s: Extract<SectionSpec, { kind: "itemsTable" }>, theme: ThemeKey): string {
  const headBg = theme === "modern" ? BRAND.navy : theme === "compact" ? BRAND.naviSoft : "#f1f5f9";
  const headColor = theme === "modern" ? "#fff" : BRAND.ink;
  const pad = theme === "compact" ? "4px 6px" : theme === "modern" ? "8px 10px" : "6px";
  const fs = theme === "compact" ? "9pt" : "10pt";
  const cellBorder = theme === "modern" ? "border-bottom:1px solid #e2e8f0;" : `border:1px solid ${BRAND.line};`;
  const headBorder = theme === "modern" ? "" : `border:1px solid ${BRAND.line};`;
  const head = s.columns
    .map(
      (c) =>
        `<th style="${headBorder}padding:${pad};font-size:${fs};${c.width ? `width:${c.width};` : ""}text-align:${c.align ?? "right"}">${c.label}</th>`,
    )
    .join("");
  const row = s.columns
    .map(
      (c) =>
        `<td style="${cellBorder}padding:${pad};font-size:${fs};text-align:${c.align ?? "right"}">${c.token}</td>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:${theme === "compact" ? "8px" : "14px"}">
  <thead><tr style="background:${headBg};color:${headColor}">${head}</tr></thead>
  <tbody>
    {{#each items}}
    <tr>${row}</tr>
    {{/each}}
  </tbody>
</table>`;
}

function secAmountBox(s: Extract<SectionSpec, { kind: "amountBox" }>, theme: ThemeKey): string {
  const bg = theme === "modern" ? `linear-gradient(90deg,${BRAND.teal},${BRAND.navy})` : BRAND.navy;
  return `<div style="background:${bg};color:#fff;border-radius:8px;padding:14px 20px;margin:14px 0;text-align:center">
  <div style="font-size:11pt;opacity:.85">المبلغ</div>
  <div style="font-size:22pt;font-weight:700;letter-spacing:1px">${s.amountToken} {{entity.currency}}</div>
  ${s.wordsToken ? `<div style="font-size:10pt;opacity:.9;margin-top:4px">${s.wordsToken}</div>` : ""}
</div>`;
}

function secTotals(s: Extract<SectionSpec, { kind: "totals" }>, theme: ThemeKey): string {
  const b = `border:1px solid ${BRAND.line};`;
  const pad = theme === "compact" ? "3px 8px" : "4px 8px";
  const grandBg = theme === "modern" ? BRAND.navy : "#f1f5f9";
  const grandColor = theme === "modern" ? "#fff" : BRAND.ink;
  const rows = s.rows
    .map((r) =>
      r.grand
        ? `<tr style="background:${grandBg};color:${grandColor};font-weight:bold"><td style="padding:6px 8px;${b}">${r.label}</td><td style="padding:6px 8px;${b};text-align:left">${r.token}</td></tr>`
        : `<tr><td style="padding:${pad};${b}">${r.label}</td><td style="padding:${pad};${b};text-align:left">${r.token}</td></tr>`,
    )
    .join("\n  ");
  return `<table style="width:300px;margin-right:auto;margin-left:0;border-collapse:collapse;margin-top:12px">
  ${rows}
</table>`;
}

function secBodyText(s: Extract<SectionSpec, { kind: "bodyText" }>, theme: ThemeKey): string {
  const pad = theme === "compact" ? "10px" : "18px";
  return `<div style="margin:${pad} 0;font-size:${theme === "compact" ? "10pt" : "11pt"};line-height:1.9;color:${BRAND.ink};white-space:pre-wrap">${s.token}</div>`;
}

function secSignature(s: Extract<SectionSpec, { kind: "signature" }>, _theme: ThemeKey): string {
  const cells = s.parties
    .map(
      (p) =>
        `<td style="width:${Math.floor(100 / s.parties.length)}%;text-align:center;padding-top:36px">
      <div style="border-top:1px solid ${BRAND.navy};width:70%;margin:0 auto;padding-top:6px;font-size:10pt;color:${BRAND.muted}">${p}</div>
    </td>`,
    )
    .join("\n    ");
  return `<table style="width:100%;margin-top:28px;border-collapse:collapse"><tr>
    ${cells}
  </tr></table>`;
}

function secZatcaQr(_theme: ThemeKey): string {
  return `<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
  <div style="flex:1">{{system.verifyBlock}}</div>
  <div style="text-align:center">
    {{entity.zatcaQr}}
    <div style="font-size:8pt;color:${BRAND.muted};margin-top:4px;font-weight:600">رمز QR — هيئة الزكاة والضريبة</div>
  </div>
</div>`;
}

function renderSection(s: SectionSpec, theme: ThemeKey): string {
  switch (s.kind) {
    case "parties": return secParties(s, theme);
    case "metaGrid": return secMetaGrid(s, theme);
    case "itemsTable": return secItemsTable(s, theme);
    case "linesTable": return "{{entity.linesTable}}";
    case "amountBox": return secAmountBox(s, theme);
    case "totals": return secTotals(s, theme);
    case "bodyText": return secBodyText(s, theme);
    case "signature": return secSignature(s, theme);
    case "zatcaQr": return secZatcaQr(theme);
    case "verify": return "{{system.verifyBlock}}";
    case "spacer": return '<div style="height:16px"></div>';
  }
}

function buildFromRecipe(recipe: DocRecipe, theme: ThemeKey): string {
  const body = recipe.sections.map((s) => renderSection(s, theme)).join("\n");
  return `<div class="print-doc">
{{branch.letterhead}}
${secTitle(recipe.title, theme)}
${body}
{{branch.footer}}
</div>`;
}

// ─── Shared column sets ──────────────────────────────────────────────────────

const LINE_ITEM_COLS = [
  { label: "#", token: "{{@index}}", width: "32px", align: "center" as const },
  { label: "البيان", token: "{{this.description}}" },
  { label: "الكمية", token: "{{this.quantity}}", width: "70px", align: "center" as const },
  { label: "سعر الوحدة", token: "{{this.unitPrice}}", width: "100px", align: "left" as const },
  { label: "الإجمالي", token: "{{this.totalPrice}}", width: "110px", align: "left" as const },
];

const VAT_TOTALS = [
  { label: "المجموع قبل الضريبة", token: "{{entity.subtotal}} {{entity.currency}}" },
  { label: "ضريبة القيمة المضافة ({{entity.vatRate}}%)", token: "{{entity.vatAmount}} {{entity.currency}}" },
  { label: "الإجمالي شامل الضريبة", token: "{{entity.total}} {{entity.currency}}", grand: true },
];

// ─── Recipes per document family ─────────────────────────────────────────────

const RECIPE_LINE_ITEM = (title: string, leftLabel: string, withVat: boolean): DocRecipe => ({
  title,
  sections: [
    { kind: "parties", leftLabel, rightFields: [["المرجع", "{{entity.ref}}"], ["التاريخ", "{{entity.date}}"], ["الحالة", "{{entity.status}}"]] },
    { kind: "itemsTable", columns: LINE_ITEM_COLS },
    ...(withVat ? [{ kind: "totals" as const, rows: VAT_TOTALS }] : [{ kind: "totals" as const, rows: [{ label: "الإجمالي", token: "{{entity.total}} {{entity.currency}}", grand: true }] }]),
    { kind: "verify" },
  ],
});

const RECIPE_VOUCHER = (title: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [["المرجع", "{{entity.ref}}"], ["التاريخ", "{{entity.date}}"], ["الجهة", "{{entity.partyName}}"], ["طريقة الدفع", "{{entity.method}}"]] },
    { kind: "amountBox", amountToken: "{{entity.amount}}", wordsToken: "{{entity.amountInWords}}" },
    { kind: "bodyText", token: "{{entity.description}}" },
    { kind: "signature", parties: ["المستلم", "المحاسب", "المدير المالي"] },
    { kind: "verify" },
  ],
});

const RECIPE_STATEMENT = (title: string, partyLabel: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [[partyLabel, "{{entity.partyName}}"], ["الفترة", "{{entity.period}}"], ["الرصيد الافتتاحي", "{{entity.openingBalance}}"], ["الرصيد الختامي", "{{entity.closingBalance}}"]] },
    { kind: "itemsTable", columns: [
      { label: "التاريخ", token: "{{this.date}}", width: "90px" },
      { label: "البيان", token: "{{this.description}}" },
      { label: "مدين", token: "{{this.debit}}", width: "100px", align: "left" },
      { label: "دائن", token: "{{this.credit}}", width: "100px", align: "left" },
      { label: "الرصيد", token: "{{this.balance}}", width: "110px", align: "left" },
    ] },
    { kind: "totals", rows: [{ label: "الرصيد الختامي", token: "{{entity.closingBalance}} {{entity.currency}}", grand: true }] },
    { kind: "verify" },
  ],
});

const RECIPE_JOURNAL = (title: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [["المرجع", "{{entity.ref}}"], ["التاريخ", "{{entity.date}}"], ["البيان", "{{entity.description}}"], ["الحالة", "{{entity.status}}"]] },
    { kind: "itemsTable", columns: [
      { label: "الحساب", token: "{{this.accountCode}} — {{this.accountName}}" },
      { label: "البيان", token: "{{this.description}}" },
      { label: "مدين", token: "{{this.debit}}", width: "110px", align: "left" },
      { label: "دائن", token: "{{this.credit}}", width: "110px", align: "left" },
    ] },
    { kind: "totals", rows: [
      { label: "إجمالي المدين", token: "{{entity.totalDebit}}" },
      { label: "إجمالي الدائن", token: "{{entity.totalCredit}}", grand: true },
    ] },
    { kind: "verify" },
  ],
});

const RECIPE_PAYSLIP = (title: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [["الموظف", "{{entity.employeeName}}"], ["الرقم الوظيفي", "{{entity.employeeNumber}}"], ["الفترة", "{{entity.period}}"], ["القسم", "{{entity.departmentName}}"]] },
    { kind: "itemsTable", columns: [
      { label: "البند", token: "{{this.label}}" },
      { label: "النوع", token: "{{this.type}}", width: "90px", align: "center" },
      { label: "المبلغ", token: "{{this.amount}}", width: "120px", align: "left" },
    ] },
    { kind: "totals", rows: [
      { label: "إجمالي الاستحقاقات", token: "{{entity.totalEarnings}} {{entity.currency}}" },
      { label: "إجمالي الاستقطاعات", token: "{{entity.totalDeductions}} {{entity.currency}}" },
      { label: "صافي الراتب", token: "{{entity.netPay}} {{entity.currency}}", grand: true },
    ] },
    { kind: "signature", parties: ["الموظف", "الموارد البشرية"] },
    { kind: "verify" },
  ],
});

const RECIPE_LETTER = (title: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [["المرجع", "{{entity.ref}}"], ["التاريخ", "{{entity.date}}"]] },
    { kind: "bodyText", token: "{{entity.body}}" },
    { kind: "signature", parties: ["التوقيع المعتمد"] },
    { kind: "verify" },
  ],
});

const RECIPE_CONTRACT = (title: string): DocRecipe => ({
  title,
  sections: [
    { kind: "metaGrid", fields: [["المرجع", "{{entity.ref}}"], ["التاريخ", "{{entity.date}}"], ["الطرف الأول", "{{entity.firstParty}}"], ["الطرف الثاني", "{{entity.secondParty}}"]] },
    { kind: "bodyText", token: "{{entity.body}}" },
    { kind: "signature", parties: ["الطرف الأول", "الطرف الثاني"] },
    { kind: "verify" },
  ],
});

// ─── entityType → recipe map ─────────────────────────────────────────────────

const DOC_RECIPES: Record<string, DocRecipe> = {
  // Line-item commercial docs
  quotation: RECIPE_LINE_ITEM("عرض سعر", "العميل", true),
  sales_order: RECIPE_LINE_ITEM("أمر بيع", "العميل", true),
  delivery_note: RECIPE_LINE_ITEM("سند تسليم", "العميل", false),
  credit_note: RECIPE_LINE_ITEM("إشعار دائن", "العميل", true),
  purchase_order: RECIPE_LINE_ITEM("أمر شراء", "المورد", true),
  purchase_request: RECIPE_LINE_ITEM("طلب شراء", "الجهة الطالبة", false),
  goods_receipt: RECIPE_LINE_ITEM("سند استلام بضاعة", "المورد", false),
  store_order: RECIPE_LINE_ITEM("طلب متجر", "العميل", true),
  stock_transfer: RECIPE_LINE_ITEM("سند نقل مخزون", "المستودع", false),
  stock_adjustment: RECIPE_LINE_ITEM("تسوية مخزون", "المستودع", false),
  umrah_invoice: RECIPE_LINE_ITEM("فاتورة عمرة", "المعتمر/الوكيل", true),
  umrah_sales_invoice: RECIPE_LINE_ITEM("فاتورة مبيعات عمرة", "العميل", true),
  umrah_agent_invoice: RECIPE_LINE_ITEM("فاتورة وكيل عمرة", "الوكيل", true),

  // Vouchers
  payment_voucher: RECIPE_VOUCHER("سند صرف"),
  receipt_voucher: RECIPE_VOUCHER("سند قبض"),
  voucher: RECIPE_VOUCHER("سند"),
  salary_advance: RECIPE_VOUCHER("سلفة راتب"),
  expense: RECIPE_VOUCHER("مصروف"),
  expense_claim: RECIPE_VOUCHER("مطالبة مصروف"),

  // Statements
  customer_statement: RECIPE_STATEMENT("كشف حساب عميل", "العميل"),
  vendor_statement: RECIPE_STATEMENT("كشف حساب مورد", "المورد"),
  account_statement: RECIPE_STATEMENT("كشف حساب", "الحساب"),
  umrah_statement: RECIPE_STATEMENT("كشف حساب عمرة", "الوكيل"),

  // Journals
  journal_entry: RECIPE_JOURNAL("قيد محاسبي"),
  recurring_journal: RECIPE_JOURNAL("قيد متكرر"),

  // Payslips
  payslip: RECIPE_PAYSLIP("قسيمة راتب"),
  payroll: RECIPE_PAYSLIP("مسير رواتب"),
  payroll_run: RECIPE_PAYSLIP("تشغيل رواتب"),

  // Letters / free-body docs
  official_letter: RECIPE_LETTER("خطاب رسمي"),
  correspondence: RECIPE_LETTER("مراسلة"),
  legal_correspondence: RECIPE_LETTER("مراسلة قانونية"),
  governance_policy: RECIPE_LETTER("سياسة حوكمة"),
  policy: RECIPE_LETTER("سياسة"),

  // Contracts
  employee_contract: RECIPE_CONTRACT("عقد عمل"),
  rental_contract: RECIPE_CONTRACT("عقد إيجار"),
  legal_contract: RECIPE_CONTRACT("عقد قانوني"),
  contract: RECIPE_CONTRACT("عقد"),
};

/** Exposed for tests + the editor: which entity types have a bespoke
 *  branded recipe (beyond the generic fallback). */
export function brandedRecipeKeys(): string[] {
  return Object.keys(DOC_RECIPES);
}
