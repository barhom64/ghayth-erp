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
import type { PaperSize, PrintTemplate, TemplateMode } from "./types.js";

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
    const rows = await rawQuery<TemplateRow>(
      `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
              "presetKey", "htmlContent", "layoutJson", "cssOverrides",
              "headerOverride", "footerOverride", "isThermal", "version"
       FROM document_templates WHERE id = $1 LIMIT 1`,
      [templateId]
    );
    if (rows[0]) return toTemplate(rows[0]);
  }

  // 1 & 2: assignments table (branch-specific, then company-wide)
  const assignment = await rawQuery<TemplateRow>(
    `SELECT t.id, t.name, t."entityType", t."branchId", t."companyId", t."paperSize", t."mode",
            t."presetKey", t."htmlContent", t."layoutJson", t."cssOverrides",
            t."headerOverride", t."footerOverride", t."isThermal", t."version"
     FROM print_template_assignments a
     JOIN document_templates t ON t.id = a."templateId"
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
  const companyDefault = await rawQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" = $1 AND "entityType" = $2 AND "isDefault" = true AND "isActive" = true
     ORDER BY "branchId" NULLS LAST, id DESC
     LIMIT 1`,
    [companyId, entityType]
  );
  if (companyDefault[0]) return toTemplate(companyDefault[0]);

  // 4: seeded preset (companyId IS NULL)
  const preset = await rawQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" IS NULL AND "entityType" = $1 AND "presetKey" = 'classic'
     ORDER BY id ASC LIMIT 1`,
    [entityType]
  );
  if (preset[0]) return toTemplate(preset[0]);

  return null;
}

export async function listTemplates(opts: {
  companyId: number;
  branchId?: number | null;
  entityType?: string;
}): Promise<PrintTemplate[]> {
  const where: string[] = [`("companyId" = $1 OR "companyId" IS NULL)`];
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
  const rows = await rawQuery<TemplateRow>(
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
