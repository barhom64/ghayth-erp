/**
 * Admin → Inbox classifier rules CRUD.
 *
 * Backs the new "قواعد التصنيف" tab on /admin/communication-control:
 * lets operators add a custom keyword bucket, edit priority/SLA, or
 * disable a global default for their tenant — without a code change.
 *
 * Tenant safety: PATCH/DELETE on a global default (companyId IS NULL)
 * creates a company-specific override instead of mutating the shared
 * row, mirroring the pattern from admin-notification-routing (#1655).
 */
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ruleSchema = z.object({
  name: z.string().min(1).max(150),
  type: z.string().min(1).max(50),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  titlePrefix: z.string().min(1).max(150),
  patterns: z.array(z.string().min(1)).min(1, "أضف نمطاً واحداً على الأقل"),
  assignmentRole: z.string().max(60).optional().nullable(),
  slaHours: z.number().int().min(1).max(720).default(24),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  description: z.string().optional().nullable(),
});

router.get("/rules", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT id, "companyId", name, type, priority, "titlePrefix", patterns,
              "assignmentRole", "slaHours", "isActive", "sortOrder", description,
              "createdAt", "updatedAt"
         FROM inbox_classifier_rules
        WHERE "companyId" = $1 OR "companyId" IS NULL
        ORDER BY "isActive" DESC, "sortOrder" ASC, id ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/classifier-rules/list");
  }
});

router.post("/rules", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(ruleSchema.safeParse(req.body));

    // Validate each pattern compiles before saving — operators get an
    // error at save time, not silent listener failures at message time.
    for (const p of body.patterns) {
      try { new RegExp(p, "i"); }
      catch (e) {
        throw new ValidationError(`نمط regex غير صالح: ${p}`);
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO inbox_classifier_rules
         ("companyId", name, type, priority, "titlePrefix", patterns,
          "assignmentRole", "slaHours", "isActive", "sortOrder", description, "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
      [
        scope.companyId, body.name, body.type, body.priority, body.titlePrefix,
        JSON.stringify(body.patterns),
        body.assignmentRole ?? null, body.slaHours, body.isActive, body.sortOrder,
        body.description ?? null, scope.userId,
      ],
    );
    assertInsert(insertId, "inbox_classifier_rules");

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "inbox_classifier.rule.created",
      entity: "inbox_classifier_rules", entityId: insertId,
      details: JSON.stringify({ name: body.name, type: body.type }),
    }).catch((e) => logger.warn(e, "[event] classifier rule.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "inbox_classifier_rules", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] classifier rule.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/classifier-rules/create");
  }
});

router.patch("/rules/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(ruleSchema.partial().safeParse(req.body ?? {}));

    if (body.patterns) {
      for (const p of body.patterns) {
        try { new RegExp(p, "i"); }
        catch { throw new ValidationError(`نمط regex غير صالح: ${p}`); }
      }
    }

    type RuleTarget = {
      id: number; companyId: number | null; name: string; type: string;
      priority: string; titlePrefix: string; patterns: unknown;
      assignmentRole: string | null; slaHours: number;
      isActive: boolean; sortOrder: number; description: string | null;
    };
    const [target] = await rawQuery<RuleTarget>(
      `SELECT id, "companyId", name, type, priority, "titlePrefix", patterns,
              "assignmentRole", "slaHours", "isActive", "sortOrder", description
         FROM inbox_classifier_rules
        WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL)
        LIMIT 1`,
      [id, scope.companyId],
    );
    if (!target) throw new NotFoundError("القاعدة غير موجودة");

    const targetPatterns: string[] = Array.isArray(target.patterns)
      ? target.patterns as string[]
      : typeof target.patterns === "string"
        ? JSON.parse(target.patterns) as string[]
        : [];
    const merged = {
      name: body.name ?? target.name,
      type: body.type ?? target.type,
      priority: body.priority ?? target.priority,
      titlePrefix: body.titlePrefix ?? target.titlePrefix,
      patterns: body.patterns ?? targetPatterns,
      assignmentRole: body.assignmentRole !== undefined ? body.assignmentRole : target.assignmentRole,
      slaHours: body.slaHours ?? target.slaHours,
      isActive: body.isActive ?? target.isActive,
      sortOrder: body.sortOrder ?? target.sortOrder,
      description: body.description !== undefined ? body.description : target.description,
    };

    let row: unknown;
    let auditAction: "update" | "create";
    if (target.companyId === scope.companyId) {
      [row] = await rawQuery(
        `UPDATE inbox_classifier_rules
            SET name=$1, type=$2, priority=$3, "titlePrefix"=$4, patterns=$5::jsonb,
                "assignmentRole"=$6, "slaHours"=$7, "isActive"=$8, "sortOrder"=$9,
                description=$10, "updatedAt"=NOW()
          WHERE id=$11 AND "companyId"=$12
         RETURNING *`,
        [
          merged.name, merged.type, merged.priority, merged.titlePrefix,
          JSON.stringify(merged.patterns),
          merged.assignmentRole, merged.slaHours, merged.isActive, merged.sortOrder,
          merged.description, id, scope.companyId,
        ],
      );
      auditAction = "update";
    } else {
      // Global default — clone as a company-specific override.
      [row] = await rawQuery(
        `INSERT INTO inbox_classifier_rules
           ("companyId", name, type, priority, "titlePrefix", patterns,
            "assignmentRole", "slaHours", "isActive", "sortOrder", description, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          scope.companyId, merged.name, merged.type, merged.priority, merged.titlePrefix,
          JSON.stringify(merged.patterns),
          merged.assignmentRole, merged.slaHours, merged.isActive, merged.sortOrder,
          merged.description, scope.userId,
        ],
      );
      auditAction = "create";
    }

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: auditAction, entity: "inbox_classifier_rules",
      entityId: (row as { id: number }).id, after: merged,
    }).catch((e) => logger.warn(e, "[audit] classifier rule.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/classifier-rules/update");
  }
});

router.delete("/rules/:id", authorize({ feature: "admin", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [target] = await rawQuery<{ id: number; companyId: number | null; name: string }>(
      `SELECT id, "companyId", name FROM inbox_classifier_rules
        WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
      [id, scope.companyId],
    );
    if (!target) throw new NotFoundError("القاعدة غير موجودة");

    if (target.companyId === scope.companyId) {
      await rawExecute(
        `DELETE FROM inbox_classifier_rules WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
    } else {
      // Global default — clone a disabled override for this tenant.
      await rawExecute(
        `INSERT INTO inbox_classifier_rules
           ("companyId", name, type, priority, "titlePrefix", patterns,
            "isActive", description, "createdBy")
         SELECT $1, name, type, priority, "titlePrefix", patterns,
                false, 'تعطيل تجاوز محلي للقاعدة الافتراضية', $2
           FROM inbox_classifier_rules
          WHERE id = $3`,
        [scope.companyId, scope.userId, id],
      );
    }

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "inbox_classifier_rules", entityId: id,
      after: { id, name: target.name },
    }).catch((e) => logger.warn(e, "[audit] classifier rule.deleted"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "admin/classifier-rules/delete");
  }
});

export default router;
