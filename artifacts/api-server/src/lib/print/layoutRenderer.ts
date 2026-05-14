/**
 * layoutRenderer — converts a visual-builder layoutJson tree into HTML.
 *
 * The visual builder (artifacts/ghayth-erp/src/pages/settings/print-templates.tsx,
 * "Visual" tab) produces a flat list of typed blocks. This module is the
 * server-side counterpart that PrintService routes through when
 * template.mode === "visual": instead of using `template.htmlContent`, the
 * orchestrator hands the layout tree to renderLayout() which emits the same
 * HTML shape the preset templates use — so variableSubstitution can then
 * fill {{branch.letterhead}}, {{entity.itemsTable}}, etc.
 *
 * Block schema (kept narrow so the editor stays simple):
 *   { type: "header" }                          → {{branch.letterhead}}
 *   { type: "title", text, level? }             → <h{1..3}>
 *   { type: "text", body }                      → <p>
 *   { type: "info_grid", items: [{label,value}]}→ 2-col grid of label/value
 *   { type: "items_table" }                     → {{entity.itemsTable}}
 *   { type: "lines_table" }                     → {{entity.linesTable}}
 *   { type: "summary", items: [{label,value,bold?}] } → totals box
 *   { type: "signature", parties: [{label}] }   → signature row
 *   { type: "qr", value? }                      → QR placeholder
 *   { type: "divider" }                         → <hr>
 *   { type: "spacer", height? }                 → vertical space
 *   { type: "footer" }                          → {{branch.footer}}
 *
 * Values may contain {{path.to.value}} tokens — those are left as-is so
 * variableSubstitution can resolve them against the entity payload.
 */

interface Block {
  type: string;
  [k: string]: unknown;
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "header":
      return "{{branch.letterhead}}";
    case "footer":
      return "{{branch.footer}}";
    case "title": {
      const text = String(b.text ?? "");
      const level = Math.min(Math.max(Number(b.level ?? 2), 1), 4);
      return `<h${level} style="text-align:center;margin:8px 0;padding-bottom:4px;border-bottom:2px solid #334155">${esc(text)}</h${level}>`;
    }
    case "text":
      return `<p style="margin:8px 0;line-height:1.6">${esc(b.body ?? "")}</p>`;
    case "info_grid": {
      const items = Array.isArray(b.items) ? (b.items as Array<{ label?: string; value?: string }>) : [];
      const cells = items
        .map(
          (i) =>
            `<div style="padding:4px 0"><span style="color:#475569">${esc(i.label ?? "")}:</span> <strong>${esc(i.value ?? "")}</strong></div>`
        )
        .join("");
      return `<div class="meta-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;padding:8px 0">${cells}</div>`;
    }
    case "items_table":
      return "{{entity.itemsTable}}";
    case "lines_table":
      return "{{entity.linesTable}}";
    case "movements_table":
      return "{{entity.movementsTable}}";
    case "summary": {
      const items = Array.isArray(b.items) ? (b.items as Array<{ label?: string; value?: string; bold?: boolean }>) : [];
      const rows = items
        .map(
          (i) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 8px${i.bold ? ";font-weight:bold;border-top:1px solid #334155;margin-top:4px" : ""}"><span>${esc(i.label ?? "")}</span><span>${esc(i.value ?? "")}</span></div>`
        )
        .join("");
      return `<div class="totals" style="margin:12px 0;max-width:360px;margin-inline-start:auto;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px">${rows}</div>`;
    }
    case "signature": {
      const parties = Array.isArray(b.parties) ? (b.parties as Array<{ label?: string }>) : [];
      const cells = parties
        .map((p) => `<div style="text-align:center;font-size:10pt;color:#475569;padding:0 8px;flex:1">${esc(p.label ?? "")}<div style="border-top:1px solid #94a3b8;margin-top:36px"></div></div>`)
        .join("");
      return `<div class="signatures" style="display:flex;justify-content:space-around;margin-top:32px;padding-top:8px">${cells}</div>`;
    }
    case "qr":
      return `<div class="qr-block" style="text-align:center;padding:8px"><div style="display:inline-block;padding:8px;border:1px solid #cbd5e1;font-family:monospace;font-size:8pt">${esc(b.value ?? "{{entity.zatcaQr}}")}</div></div>`;
    case "divider":
      return `<hr style="border:0;border-top:1px dashed #94a3b8;margin:12px 0"/>`;
    case "spacer": {
      const h = Math.min(Math.max(Number(b.height ?? 16), 4), 200);
      return `<div style="height:${h}px"></div>`;
    }
    default:
      return "";
  }
}

export function renderLayoutToHtml(layout: unknown): string {
  if (!Array.isArray(layout)) return "";
  const blocks = layout as Block[];
  const body = blocks.map(renderBlock).join("\n");
  return `<div class="print-doc">${body}</div>`;
}
