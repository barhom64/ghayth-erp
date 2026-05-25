/**
 * templateResolver — finds the print template for a given (companyId, branchId,
 * entityType) tuple. Lookup order:
 *   1. Explicit branch assignment in print_template_assignments
 *   2. Company-wide assignment (branchId IS NULL) in print_template_assignments
 *   3. document_templates row marked isDefault for this entityType + company
 *   4. Seeded preset (companyId IS NULL, presetKey = 'classic') for the entityType
 *
 * The last step is guaranteed by migration 081_print_engine_seed.sql, so the
 * resolver never returns null for phase-1 entities.
 */

import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";
import type { PaperSize, PrintTemplate, TemplateMode } from "./types.js";

/** Safe wrapper — returns [] when the underlying query throws (table missing,
 *  column missing, etc). Lets resolveTemplate fall through to the next layer
 *  instead of bubbling a DB error to the caller. */
async function safeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    return await rawQuery<T>(sql, params);
  } catch (err) {
    logger.warn(err as Error, "[print/resolveTemplate] query failed, falling through");
    return [];
  }
}

interface TemplateRow {
  id: number;
  name: string | null;
  entityType: string | null;
  branchId: number | null;
  companyId: number | null;
  paperSize: string | null;
  mode: string | null;
  presetKey: string | null;
  htmlContent: string | null;
  layoutJson: unknown;
  cssOverrides: string | null;
  headerOverride: unknown;
  footerOverride: unknown;
  isThermal: boolean | null;
  version: number | null;
}

function toTemplate(row: TemplateRow): PrintTemplate {
  return {
    id: row.id,
    name: row.name ?? "",
    entityType: row.entityType,
    branchId: row.branchId,
    companyId: row.companyId,
    paperSize: (row.paperSize as PaperSize) ?? "A4",
    mode: (row.mode as TemplateMode) ?? "preset",
    presetKey: row.presetKey,
    htmlContent: row.htmlContent,
    layoutJson: row.layoutJson,
    cssOverrides: row.cssOverrides,
    headerOverride: row.headerOverride,
    footerOverride: row.footerOverride,
    isThermal: Boolean(row.isThermal),
    version: row.version ?? 1,
  };
}

export async function resolveTemplate(opts: {
  companyId: number;
  branchId: number | null;
  entityType: string;
  templateId?: number;
}): Promise<PrintTemplate | null> {
  const { companyId, branchId, entityType, templateId } = opts;

  if (templateId) {
    const rows = await safeQuery<TemplateRow>(
      `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
              "presetKey", "htmlContent", "layoutJson", "cssOverrides",
              "headerOverride", "footerOverride", "isThermal", "version"
       FROM document_templates WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [templateId]
    );
    if (rows[0]) return toTemplate(rows[0]);
  }

  // 1 & 2: assignments table (branch-specific, then company-wide)
  const assignment = await safeQuery<TemplateRow>(
    `SELECT t.id, t.name, t."entityType", t."branchId", t."companyId", t."paperSize", t."mode",
            t."presetKey", t."htmlContent", t."layoutJson", t."cssOverrides",
            t."headerOverride", t."footerOverride", t."isThermal", t."version"
     FROM print_template_assignments a
     JOIN document_templates t ON t.id = a."templateId" AND t."deletedAt" IS NULL
     WHERE a."companyId" = $1
       AND a."entityType" = $2
       AND a."isDefault" = true
       AND (a."branchId" = $3 OR a."branchId" IS NULL)
     ORDER BY (a."branchId" IS NOT NULL) DESC
     LIMIT 1`,
    [companyId, entityType, branchId]
  );
  if (assignment[0]) return toTemplate(assignment[0]);

  // 3: company default in document_templates
  const companyDefault = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" = $1 AND "entityType" = $2 AND "isDefault" = true AND "isActive" = true AND "deletedAt" IS NULL
     ORDER BY "branchId" NULLS LAST, id DESC
     LIMIT 1`,
    [companyId, entityType]
  );
  if (companyDefault[0]) return toTemplate(companyDefault[0]);

  // 4: seeded preset (companyId IS NULL)
  const preset = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" IS NULL AND "entityType" = $1 AND "presetKey" = 'classic' AND "deletedAt" IS NULL
     ORDER BY id ASC LIMIT 1`,
    [entityType]
  );
  if (preset[0]) return toTemplate(preset[0]);

  // 5: synthesized universal fallback — every entityType prints something
  // even if nobody seeded or designed a template for it. Renders the branch
  // letterhead, a sensible title, the entity fields as an info-grid, the
  // items table if present, and the branch footer.
  return universalFallback(entityType);
}

/** In-memory template that works for any entityType. */
function universalFallback(entityType: string): PrintTemplate {
  return {
    id: -1,
    name: `Universal fallback — ${entityType}`,
    entityType,
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "universal",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${entityType}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  };
}

export async function listTemplates(opts: {
  companyId: number;
  branchId?: number | null;
  entityType?: string;
}): Promise<PrintTemplate[]> {
  const where: string[] = [`("companyId" = $1 OR "companyId" IS NULL)`, `"deletedAt" IS NULL`];
  const params: unknown[] = [opts.companyId];
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`"entityType" = $${params.length}`);
  }
  if (opts.branchId !== undefined) {
    if (opts.branchId === null) {
      where.push(`"branchId" IS NULL`);
    } else {
      params.push(opts.branchId);
      where.push(`("branchId" = $${params.length} OR "branchId" IS NULL)`);
    }
  }
  const rows = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE ${where.join(" AND ")}
     ORDER BY "entityType" NULLS LAST, name`,
    params
  );
  return rows.map(toTemplate);
}
