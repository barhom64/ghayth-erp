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
  const sample = items[0] as Record<string, unknown>;
  const cols = Object.keys(sample).filter(
    (k) => !["id", "createdAt", "updatedAt"].includes(k) && !k.endsWith("Id")
  ).slice(0, 6);
  const head = cols.map((c) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">${escapeHtml(c)}</th>`).join("");
  const body = items
    .map((r) => {
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
}

export function substitute(input: SubstitutionInput): string {
  const { data, branch, isThermal, watermark } = input;
  let html = input.template ?? "";

  // Auto-tokens
  const autoTokens: Record<string, string> = {
    "branch.letterhead": buildLetterheadA4(branch),
    "branch.letterheadThermal": buildLetterheadThermal(branch),
    "branch.footer": buildFooter(branch, false),
    "branch.footerThermal": buildFooter(branch, true),
    "entity.itemsTable": buildItemsTable((data as { items?: unknown }).items),
    "entity.linesTable": buildLinesTable((data as { lines?: unknown }).lines),
    "entity.movementsTable": buildMovementsTable((data as { movements?: unknown }).movements),
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
  const baseTemplate = ctx.template.mode === "visual" && ctx.template.layoutJson
    ? renderLayoutToHtml(ctx.template.layoutJson)
    : ctx.template.htmlContent ?? "";
  return substitute({
    template: baseTemplate,
    data: ctx.data,
    branch: ctx.branch,
    isThermal: ctx.template.isThermal || ctx.format.startsWith("thermal"),
    watermark: ctx.watermark,
  });
}
