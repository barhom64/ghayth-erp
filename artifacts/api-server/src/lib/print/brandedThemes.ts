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
  if (entityType === "invoice" || entityType === "sales_invoice") {
    return { html: buildInvoiceTheme(theme), css, theme };
  }
  return { html: buildGenericTheme(theme), css, theme };
}
