/**
 * variableSubstitution — minimal Handlebars-like engine sufficient for the
 * preset HTML templates seeded by 081_print_engine_seed.sql. Supports:
 *   {{path.to.value}}          — simple variable
 *   {{#each items}}…{{/each}}  — array repetition with @index/this
 *   {{branch.letterhead}}      — auto-generated A4 header block
 *   {{branch.letterheadThermal}}- auto-generated thermal header block
 *   {{branch.footer}}           — auto-generated footer
 *   {{entity.itemsTable}}       — auto-generated <table> from data.items
 *
 * Output is plain HTML safe to embed in a print iframe or to feed into the
 * thermal HTML adapter.
 */

import type { BranchLetterhead, RenderContext } from "./types.js";
import { renderLayoutToHtml } from "./layoutRenderer.js";

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function get(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function buildLetterheadA4(branch: BranchLetterhead): string {
  const logo = branch.logoUrl
    ? `<img src="${escapeHtml(branch.logoUrl)}" alt="logo" style="max-height:64px"/>`
    : "";
  return `<header class="branch-letterhead" style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #334155;padding-bottom:8px;margin-bottom:12px">
  <div>${logo}</div>
  <div style="text-align:center;flex:1">
    <div style="font-weight:bold;font-size:14pt">${escapeHtml(branch.companyName)}</div>
    <div style="font-size:11pt">${escapeHtml(branch.branchName)}</div>
    ${branch.branchNameEn ? `<div style="font-size:9pt;color:#475569" dir="ltr">${escapeHtml(branch.branchNameEn)}</div>` : ""}
  </div>
  <div style="text-align:left;font-size:9pt;color:#475569">
    ${branch.phone ? `<div dir="ltr">${escapeHtml(branch.phone)}</div>` : ""}
    ${branch.email ? `<div dir="ltr">${escapeHtml(branch.email)}</div>` : ""}
    ${branch.taxNumber ? `<div>الرقم الضريبي: ${escapeHtml(branch.taxNumber)}</div>` : ""}
  </div>
</header>`;
}

function buildLetterheadThermal(branch: BranchLetterhead): string {
  return `<div class="t-header" style="text-align:center;border-bottom:1px dashed #000;padding-bottom:4px;margin-bottom:4px">
  ${branch.logoUrl ? `<img src="${escapeHtml(branch.logoUrl)}" style="max-height:40px"/>` : ""}
  <div style="font-weight:bold;font-size:11pt">${escapeHtml(branch.companyName)}</div>
  <div style="font-size:9pt">${escapeHtml(branch.branchName)}</div>
  ${branch.phone ? `<div style="font-size:8pt" dir="ltr">${escapeHtml(branch.phone)}</div>` : ""}
  ${branch.taxNumber ? `<div style="font-size:8pt">VAT: ${escapeHtml(branch.taxNumber)}</div>` : ""}
</div>`;
}

function buildFooter(branch: BranchLetterhead, isThermal: boolean): string {
  if (!branch.footerText && !branch.address) return "";
  const border = isThermal ? "border-top:1px dashed #000" : "border-top:1px solid #cbd5e1";
  return `<footer class="branch-footer" style="${border};padding-top:6px;margin-top:12px;text-align:center;font-size:${isThermal ? "8pt" : "9pt"};color:#475569">
  ${branch.footerText ? `<div>${escapeHtml(branch.footerText)}</div>` : ""}
  ${branch.address ? `<div>${escapeHtml(branch.address)}</div>` : ""}
</footer>`;
}

function buildItemsTable(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  // Find the first row that's actually a non-null object — protects against
  // weird shapes (a column with NULL JSONB, a row that came back as a
  // primitive) so Object.keys() can't blow up on null/undefined.
  const sample = items.find((r) => r && typeof r === "object") as Record<string, unknown> | undefined;
  if (!sample) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  const cols = Object.keys(sample).filter(
    (k) => !["id", "createdAt", "updatedAt"].includes(k) && !k.endsWith("Id")
  ).slice(0, 6);
  if (cols.length === 0) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  const head = cols.map((c) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">${escapeHtml(c)}</th>`).join("");
  const body = items
    .map((r) => {
      if (!r || typeof r !== "object") return "";
      const row = r as Record<string, unknown>;
      const cells = cols
        .map(
          (c) =>
            `<td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">${escapeHtml(formatValue(row[c]))}</td>`
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildLinesTable(lines: unknown): string {
  return buildItemsTable(lines);
}

function buildMovementsTable(movements: unknown): string {
  return buildItemsTable(movements);
}

/** Phase 6 — a small bottom-corner block with the QR + verify URL +
 *  jobId for scanners. Designed to be dropped via `{{system.verifyBlock}}`
 *  in any preset that wants the verification badge. Renders nothing for
 *  ephemeral previews (no jobId allocated). */
function buildVerifyBlock(opts: {
  verifyUrl?: string | null;
  verifyQrDataUrl?: string | null;
  jobId?: string | null;
}): string {
  if (!opts.jobId) return "";
  const qr = opts.verifyQrDataUrl
    ? `<img src="${opts.verifyQrDataUrl}" alt="QR" style="width:80px;height:80px;display:block;"/>`
    : "";
  const url = opts.verifyUrl ? escapeHtml(opts.verifyUrl) : "";
  const jid = escapeHtml(opts.jobId);
  return `<div style="margin-top:14px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:9pt;background:#f8fafc">
    ${qr}
    <div style="flex:1;line-height:1.5">
      <div style="font-weight:bold;color:#0f172a">للتحقق من صحة المستند</div>
      <div style="color:#64748b">امسح الرمز أو افتح:</div>
      <div dir="ltr" style="font-family:monospace;font-size:8pt;color:#334155;word-break:break-all">${url}</div>
      <div style="color:#94a3b8;margin-top:2px">رقم المرجع: <span dir="ltr" style="font-family:monospace">${jid}</span></div>
    </div>
  </div>`;
}

/** Expand simple {{#each}} blocks. */
function expandEach(template: string, data: Record<string, unknown>): string {
  const re = /\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  return template.replace(re, (_match, path, body) => {
    const list = get(data, path);
    if (!Array.isArray(list)) return "";
    return list
      .map((item, idx) => {
        // Substitute @index and this/path within the body using a local scope.
        return body
          .replace(/\{\{@index\}\}/g, String(idx + 1))
          .replace(/\{\{this\}\}/g, escapeHtml(formatValue(item)))
          .replace(/\{\{this\.([\w.]+)\}\}/g, (_m: string, p: string) =>
            escapeHtml(formatValue(get(item, p)))
          );
      })
      .join("");
  });
}

export interface SubstitutionInput {
  template: string;
  data: Record<string, unknown>;
  branch: BranchLetterhead;
  isThermal: boolean;
  watermark?: string;
  /** Phase 6 verify context — when present, templates can use
   *  {{system.verifyUrl}} (text) or {{system.verifyQr}} (img src).
   *  Allocated upfront by printService so the URL matches the audit row. */
  verifyUrl?: string | null;
  verifyQrDataUrl?: string | null;
  jobId?: string | null;
}

export function substitute(input: SubstitutionInput): string {
  const { data, branch, isThermal, watermark, verifyUrl, verifyQrDataUrl, jobId } = input;
  let html = input.template ?? "";

  // Auto-tokens
  const autoTokens: Record<string, string> = {
    "branch.letterhead": buildLetterheadA4(branch),
    "branch.letterheadThermal": buildLetterheadThermal(branch),
    "branch.footer": buildFooter(branch, false),
    "branch.footerThermal": buildFooter(branch, true),
    // Phase 6 verify tokens — templates can reference these to show a QR
    // and a verify URL on every printed page. Empty strings when this is
    // an ephemeral preview (no audit row, nothing to verify against).
    "system.verifyUrl": verifyUrl ?? "",
    "system.verifyQr": verifyQrDataUrl
      ? `<img src="${verifyQrDataUrl}" alt="verify QR" style="width:90px;height:90px;display:block;"/>`
      : "",
    "system.verifyBlock": buildVerifyBlock({ verifyUrl, verifyQrDataUrl, jobId }),
    "entity.itemsTable": buildItemsTable((data as { items?: unknown }).items),
    "entity.linesTable": buildLinesTable((data as { lines?: unknown }).lines),
    "entity.movementsTable": buildMovementsTable((data as { movements?: unknown }).movements),
    // Umrah daily run-sheet has three independent sections — generic table
    // tokens so the same auto-builder handles them without bespoke code.
    "entity.arrivalsTable": buildItemsTable((data as { arrivals?: unknown }).arrivals),
    "entity.departuresTable": buildItemsTable((data as { departures?: unknown }).departures),
    "entity.overstaysTable": buildItemsTable((data as { overstays?: unknown }).overstays),
    "date.today": new Date().toLocaleDateString("ar-SA"),
    "date.now": new Date().toLocaleString("ar-SA"),
    "watermark": watermark ?? "",
  };

  for (const [key, val] of Object.entries(autoTokens)) {
    html = html.split(`{{${key}}}`).join(val);
  }

  // Expand {{#each path}}…{{/each}} blocks
  html = expandEach(html, data);

  // Expand simple {{path.to.value}} placeholders.
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_m, path) => {
    const v = get(data, path);
    return escapeHtml(formatValue(v));
  });

  if (watermark) {
    html += `<div class="watermark" style="position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:84pt;color:rgba(220,38,38,0.16);font-weight:bold;pointer-events:none;z-index:9999;letter-spacing:8px">${escapeHtml(watermark)}</div>`;
  }
  return html;
}

export function renderContextToHtml(ctx: RenderContext): string {
  // Visual-mode templates store a block tree in layoutJson; convert it to the
  // same {{token}} HTML shape the preset templates use, then run substitution.
  let baseTemplate = ctx.template.mode === "visual" && ctx.template.layoutJson
    ? renderLayoutToHtml(ctx.template.layoutJson)
    : ctx.template.htmlContent ?? "";
  // BLANK-PAGE GUARD: a template can resolve to an empty body when the user
  // saves a draft with no htmlContent, or when a visual layout serialises
  // to an empty tree, or when a stub loader returns nothing for the items
  // table. Rendering empty bytes shows up as a fully-blank popup in the
  // browser — the SPA can't tell that apart from "popup-blocked" or
  // "Arabic mojibake", so users report "ما طبع شي".
  //
  // Fall back to a synthetic universal block: letterhead + meta-grid built
  // from whatever `data.entity` actually has + items table + footer. This
  // guarantees every render produces at least the branch header, the
  // entity id, and the verify block on the page.
  if (!baseTemplate.trim()) {
    baseTemplate = `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${escapeHtml(ctx.entityType)}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
  }
  // Template-level overrides — the cliché editor lets users upload a custom
  // logo, override the company/branch header text, set a custom footer, and
  // attach a signature image per template. These win over the branch's
  // default letterhead so a single branch can have multiple presentations
  // (e.g. ZATCA invoice vs internal voucher).
  const headerOv = (ctx.template.headerOverride as Record<string, unknown>) ?? {};
  const footerOv = (ctx.template.footerOverride as Record<string, unknown>) ?? {};
  const mergedBranch = {
    ...ctx.branch,
    logoUrl: (headerOv.logoUrl as string) || ctx.branch.logoUrl,
    companyName: (headerOv.companyName as string) || ctx.branch.companyName,
    branchName: (headerOv.branchName as string) || ctx.branch.branchName,
    address: (headerOv.address as string) || ctx.branch.address,
    phone: (headerOv.phone as string) || ctx.branch.phone,
    email: (headerOv.email as string) || ctx.branch.email,
    website: (headerOv.website as string) || ctx.branch.website,
    taxNumber: (headerOv.taxNumber as string) || ctx.branch.taxNumber,
    crNumber: (headerOv.crNumber as string) || ctx.branch.crNumber,
    footerText: (footerOv.text as string) || ctx.branch.footerText,
  };
  const subOpts = {
    data: ctx.data,
    branch: mergedBranch,
    isThermal: ctx.template.isThermal || ctx.format.startsWith("thermal"),
    watermark: ctx.watermark,
    verifyUrl: ctx.verifyUrl ?? null,
    verifyQrDataUrl: ctx.verifyQrDataUrl ?? null,
    jobId: ctx.jobId ?? null,
  };
  let rendered = substitute({ template: baseTemplate, ...subOpts });

  // POST-SUBSTITUTION EMPTY-BODY GUARD: a template can be syntactically
  // non-empty but render to nothing visible — every {{token}} resolves to
  // an empty string because the data shape doesn't match the template's
  // expectations, or because branchContext returned empty letterhead, or
  // because a hand-saved template has bogus structure. The result is a
  // page with only the watermark overlay (which is layered on top via the
  // adapter wrapper, not from `rendered`) — users see a blank page and
  // file "ما يطبع شي" tickets.
  //
  // Strip the rendered HTML down to what the user actually sees (no
  // <style>, no <script>, no comments, no whitespace) and if the
  // remaining text + meaningful tag count is suspiciously low, fall back
  // to the universal preset. This is belt-and-suspenders on top of the
  // pre-substitution empty-template guard above — that one caught
  // `htmlContent=""`, this one catches `htmlContent="<div></div>"` and
  // every other "syntactically present but visually empty" case.
  const visibleLen = rendered
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
  if (visibleLen < 50) {
    // eslint-disable-next-line no-console
    console.warn(
      `[print/render] post-substitution body almost empty (visibleLen=${visibleLen}) — falling back to universal preset for ${ctx.entityType}/${ctx.entityId}`,
    );
    const universalTemplate = `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${escapeHtml(ctx.entityType)} — ${escapeHtml(String(ctx.entityId))}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
    rendered = substitute({ template: universalTemplate, ...subOpts });
  }
  return rendered;
}
