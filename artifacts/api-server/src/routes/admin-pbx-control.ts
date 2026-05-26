/**
 * Admin → PBX Control Plane (#1139 §3 — voice side).
 *
 * Surfaces:
 *   1. overview           — call counts + IVR menu count + transcript queue depth
 *   2. extensions         — CRUD for the extension→employee/department map
 *   3. ivr-menus          — CRUD for IVR menu definitions + nested options
 *   4. recordings         — list pbx_call_recordings + retention metadata
 *   5. transcripts        — pending/failed queue + retry/summarise actions
 *
 * Also exposes /api/admin/pbx-control/ivr-action — a webhook the PBX
 * vendor calls when a caller hits a key. Returns vendor-agnostic JSON
 * (kind: extension/menu/voicemail/department/hangup/greeting) the
 * vendor's dialplan translates into SIP actions. This is the only
 * public-flavour endpoint here; the rest are admin-only.
 */
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import {
  invalidatePbxControlCache,
  resolveIvrAction,
  enqueueTranscription,
  runPendingTranscription,
} from "../lib/pbxControl.js";
import { aiEngine } from "../lib/aiEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────── overview ─────────────────────────────────────────

router.get("/overview", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const [
      callsByDir,
      menus,
      extensions,
      pendingTranscripts,
      failedTranscripts,
      pendingSummaries,
      recordingsCount,
    ] = await Promise.all([
      rawQuery(
        `SELECT direction, COUNT(*)::int AS count
           FROM pbx_calls
          WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'
          GROUP BY direction`,
        [cid],
      ),
      rawQuery(
        `SELECT id, slug, name, status FROM ivr_menus
          WHERE "companyId" = $1 ORDER BY status DESC, name ASC`,
        [cid],
      ),
      rawQuery(
        `SELECT type, COUNT(*) FILTER (WHERE status='active')::int AS active,
                COUNT(*) FILTER (WHERE status='disabled')::int AS disabled
           FROM pbx_extensions
          WHERE "companyId" = $1
          GROUP BY type`,
        [cid],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pbx_call_transcripts
          WHERE "companyId" = $1 AND status = 'pending'`,
        [cid],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pbx_call_transcripts
          WHERE "companyId" = $1 AND status = 'failed'`,
        [cid],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pbx_call_transcripts
          WHERE "companyId" = $1 AND status = 'completed' AND summary IS NULL`,
        [cid],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pbx_call_recordings
          WHERE "companyId" = $1 AND status = 'active'`,
        [cid],
      ),
    ]);

    res.json(maskFields(req, {
      callsLast24h: callsByDir,
      menus,
      extensions,
      transcripts: {
        pending: Number(pendingTranscripts[0]?.count ?? 0),
        failed: Number(failedTranscripts[0]?.count ?? 0),
        readyForSummary: Number(pendingSummaries[0]?.count ?? 0),
      },
      recordings: { active: Number(recordingsCount[0]?.count ?? 0) },
      collectedAt: new Date().toISOString(),
    }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/overview");
  }
});

// ─────────────────────── Extensions ───────────────────────────────────────

const extensionCreateSchema = z.object({
  extension: z.string().min(1).max(20).regex(/^[0-9*#]+$/, "أرقام و * و # فقط"),
  name: z.string().min(1).max(200),
  employeeId: z.number().int().positive().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  type: z.enum(["employee", "department", "queue", "voicemail"]).default("employee"),
  status: z.enum(["active", "disabled"]).default("active"),
  ringTimeoutSeconds: z.number().int().min(5).max(300).default(30),
  voicemailEnabled: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

router.get("/extensions", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT e.id, e.extension, e.name, e."employeeId", e."departmentId", e.type, e.status,
              e."ringTimeoutSeconds", e."voicemailEnabled", e.notes,
              e."createdAt", e."updatedAt",
              emp."nameAr" AS "employeeName"
         FROM pbx_extensions e
         LEFT JOIN employees emp ON emp.id = e."employeeId"
        WHERE e."companyId" = $1
        ORDER BY e.extension ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/extensions/list");
  }
});

router.post("/extensions", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(extensionCreateSchema.safeParse(req.body));

    const { insertId } = await rawExecute(
      `INSERT INTO pbx_extensions
         ("companyId", extension, name, "employeeId", "departmentId", type, status,
          "ringTimeoutSeconds", "voicemailEnabled", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        scope.companyId, body.extension, body.name,
        body.employeeId ?? null, body.departmentId ?? null, body.type, body.status,
        body.ringTimeoutSeconds, body.voicemailEnabled, body.notes ?? null,
      ],
    ).catch((err) => {
      if (String(err?.message).includes("pbx_extensions_company_ext_unique")) {
        throw new ConflictError("هذا الامتداد مسجّل بالفعل", { field: "extension" });
      }
      throw err;
    });
    assertInsert(insertId, "pbx_extensions");

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "pbx_control.extension.created",
      entity: "pbx_extensions", entityId: insertId,
      details: JSON.stringify({ extension: body.extension }),
    }).catch((e) => logger.warn(e, "[event] extension.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "pbx_extensions", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] extension.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/extensions/create");
  }
});

router.patch("/extensions/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(extensionCreateSchema.partial().omit({ extension: true }).safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [col, val] of Object.entries(body)) {
      if (val === undefined) continue;
      sets.push(`"${col}" = $${idx++}`);
      params.push(val);
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);

    const [row] = await rawQuery(
      `UPDATE pbx_extensions SET ${sets.join(", ")}
        WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("الامتداد غير موجود");

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "pbx_extensions", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] extension.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/extensions/update");
  }
});

// ─────────────────────── IVR menus ────────────────────────────────────────

const ivrMenuSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-_]+$/, "أحرف صغيرة وأرقام و - فقط"),
  name: z.string().min(1).max(200),
  greetingText: z.string().min(1, "نص الترحيب مطلوب"),
  greetingAudioUrl: z.string().url().optional().nullable(),
  language: z.string().default("ar"),
  timeoutSeconds: z.number().int().min(3).max(60).default(10),
  fallbackAction: z.enum(["hangup", "extension", "menu"]).default("hangup"),
  fallbackTargetExtension: z.string().optional().nullable(),
  fallbackTargetMenuId: z.number().int().positive().optional().nullable(),
  status: z.enum(["active", "disabled"]).default("active"),
  notes: z.string().optional().nullable(),
});

const ivrOptionSchema = z.object({
  dtmfKey: z.string().regex(/^([0-9]|\*|#)$/, "مفتاح DTMF غير صالح"),
  label: z.string().min(1).max(200),
  action: z.enum(["extension", "menu", "voicemail", "hangup", "department"]),
  targetExtension: z.string().optional().nullable(),
  targetMenuId: z.number().int().positive().optional().nullable(),
  targetDepartmentId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

router.get("/ivr-menus", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT m.id, m.slug, m.name, m."greetingText", m."greetingAudioUrl", m.language,
              m."timeoutSeconds", m."fallbackAction", m."fallbackTargetExtension",
              m."fallbackTargetMenuId", m.status, m.notes, m."createdAt", m."updatedAt",
              (SELECT COUNT(*)::int FROM ivr_menu_options o WHERE o."menuId" = m.id) AS "optionCount"
         FROM ivr_menus m
        WHERE m."companyId" = $1
        ORDER BY m.status DESC, m.name ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/list");
  }
});

router.get("/ivr-menus/:id", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const id = parseId(req.params.id, "id");
    const [menu] = await rawQuery(
      `SELECT * FROM ivr_menus WHERE id = $1 AND "companyId" = $2`,
      [id, cid],
    );
    if (!menu) throw new NotFoundError("القائمة غير موجودة");
    const options = await rawQuery(
      `SELECT id, "dtmfKey", label, action, "targetExtension", "targetMenuId",
              "targetDepartmentId", "sortOrder"
         FROM ivr_menu_options
        WHERE "menuId" = $1
        ORDER BY "sortOrder", id`,
      [id],
    );
    res.json(maskFields(req, { menu, options }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/get");
  }
});

router.post("/ivr-menus", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(ivrMenuSchema.safeParse(req.body));

    const { insertId } = await rawExecute(
      `INSERT INTO ivr_menus
         ("companyId", slug, name, "greetingText", "greetingAudioUrl", language,
          "timeoutSeconds", "fallbackAction", "fallbackTargetExtension",
          "fallbackTargetMenuId", status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        scope.companyId, body.slug, body.name, body.greetingText, body.greetingAudioUrl ?? null,
        body.language, body.timeoutSeconds, body.fallbackAction,
        body.fallbackTargetExtension ?? null, body.fallbackTargetMenuId ?? null,
        body.status, body.notes ?? null,
      ],
    ).catch((err) => {
      if (String(err?.message).includes("ivr_menus_company_slug_unique")) {
        throw new ConflictError("قائمة بنفس الـ slug مسجّلة بالفعل", { field: "slug" });
      }
      throw err;
    });
    assertInsert(insertId, "ivr_menus");
    invalidatePbxControlCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "pbx_control.ivr_menu.created",
      entity: "ivr_menus", entityId: insertId,
      details: JSON.stringify({ slug: body.slug }),
    }).catch((e) => logger.warn(e, "[event] menu.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "ivr_menus", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] menu.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/create");
  }
});

router.patch("/ivr-menus/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(ivrMenuSchema.partial().omit({ slug: true }).safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [col, val] of Object.entries(body)) {
      if (val === undefined) continue;
      sets.push(`"${col}" = $${idx++}`);
      params.push(val);
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);

    const [row] = await rawQuery(
      `UPDATE ivr_menus SET ${sets.join(", ")}
        WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("القائمة غير موجودة");
    invalidatePbxControlCache();

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "ivr_menus", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] menu.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/update");
  }
});

router.post("/ivr-menus/:id/options", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const menuId = parseId(req.params.id, "id");
    const body = zodParse(ivrOptionSchema.safeParse(req.body));

    // Verify the menu exists for this tenant before inserting an
    // option attached to it (FK would catch it but the error message
    // would be opaque).
    const [menu] = await rawQuery<{ id: number }>(
      `SELECT id FROM ivr_menus WHERE id = $1 AND "companyId" = $2`,
      [menuId, scope.companyId],
    );
    if (!menu) throw new NotFoundError("القائمة غير موجودة");

    const { insertId } = await rawExecute(
      `INSERT INTO ivr_menu_options
         ("menuId", "dtmfKey", label, action, "targetExtension",
          "targetMenuId", "targetDepartmentId", "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        menuId, body.dtmfKey, body.label, body.action,
        body.targetExtension ?? null, body.targetMenuId ?? null,
        body.targetDepartmentId ?? null, body.sortOrder,
      ],
    ).catch((err) => {
      if (String(err?.message).includes("ivr_menu_options_menu_key_unique")) {
        throw new ConflictError("هذا المفتاح مسجّل بالفعل في القائمة", { field: "dtmfKey" });
      }
      throw err;
    });
    assertInsert(insertId, "ivr_menu_options");
    invalidatePbxControlCache();

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "ivr_menu_options", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] menu_option.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/options/create");
  }
});

router.delete("/ivr-menus/:menuId/options/:optionId", authorize({ feature: "admin", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const menuId = parseId(req.params.menuId, "menuId");
    const optionId = parseId(req.params.optionId, "optionId");
    const { affectedRows } = await rawExecute(
      `DELETE FROM ivr_menu_options
        WHERE id = $1 AND "menuId" = $2
          AND EXISTS (SELECT 1 FROM ivr_menus WHERE id = $2 AND "companyId" = $3)`,
      [optionId, menuId, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الخيار غير موجود");
    invalidatePbxControlCache();

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "ivr_menu_options", entityId: optionId, after: { menuId },
    }).catch((e) => logger.warn(e, "[audit] menu_option.deleted"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-menus/options/delete");
  }
});

// ─────────────────────── IVR routing simulator ────────────────────────────

/**
 * POST /ivr-test — dry-run the IVR resolver for a given (menuSlug,
 * dtmfKey). Lets an operator preview the routing tree before
 * publishing it.
 */
const ivrTestSchema = z.object({
  menuSlug: z.string().min(1),
  dtmfKey: z.string().optional().nullable(),
});

router.post("/ivr-test", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const body = zodParse(ivrTestSchema.safeParse(req.body));
    const action = await resolveIvrAction(cid, body.menuSlug, body.dtmfKey ?? undefined);
    if (!action) throw new NotFoundError("القائمة غير موجودة أو معطّلة");
    res.json(maskFields(req, { action }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/ivr-test");
  }
});

// ─────────────────────── Recordings ───────────────────────────────────────

router.get("/recordings", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT r.id, r."callId", r."recordingUrl", r."durationMs", r."fileSizeBytes",
              r."retentionExpiresAt", r.status, r."createdAt",
              c."callerNumber", c."calledNumber", c.direction, c."createdAt" AS "callAt"
         FROM pbx_call_recordings r
         JOIN pbx_calls c ON c.id = r."callId"
        WHERE r."companyId" = $1
        ORDER BY r."createdAt" DESC
        LIMIT 100`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/recordings/list");
  }
});

// ─────────────────────── Transcripts queue ────────────────────────────────

router.get("/transcripts", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const status = (req.query.status as string | undefined) ?? null;
    const params: unknown[] = [cid];
    let cond = "";
    if (status) { params.push(status); cond = ` AND t.status = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT t.id, t."callId", t.provider, t.language, t.status,
              t."errorMessage", t."transcribedAt", t."summarisedAt", t."createdAt",
              c."callerNumber", c."calledNumber", c.duration,
              LEFT(t.transcript, 200) AS "transcriptPreview",
              LEFT(t.summary, 200)    AS "summaryPreview",
              (t.transcript IS NOT NULL) AS "hasTranscript",
              (t.summary    IS NOT NULL) AS "hasSummary"
         FROM pbx_call_transcripts t
         JOIN pbx_calls c ON c.id = t."callId"
        WHERE t."companyId" = $1${cond}
        ORDER BY t."createdAt" DESC
        LIMIT 100`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/transcripts/list");
  }
});

router.get("/transcripts/:id", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT t.*, c."callerNumber", c."calledNumber", c.duration
         FROM pbx_call_transcripts t
         JOIN pbx_calls c ON c.id = t."callId"
        WHERE t.id = $1 AND t."companyId" = $2`,
      [id, cid],
    );
    if (!row) throw new NotFoundError("النسخة غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/transcripts/get");
  }
});

/**
 * POST /transcripts/:callId/enqueue
 * Manually queue (or re-queue) a call for transcription. Used when a
 * recording showed up after the auto-enqueue path or when retrying
 * a previously-failed row.
 */
router.post("/transcripts/:callId/enqueue", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const callId = parseId(req.params.callId, "callId");
    // Confirm the call belongs to this tenant before touching the queue.
    const [call] = await rawQuery<{ id: number; companyId: number }>(
      `SELECT id, "companyId" FROM pbx_calls WHERE id = $1`,
      [callId],
    );
    if (!call || call.companyId !== scope.companyId) {
      throw new NotFoundError("المكالمة غير موجودة");
    }
    const language = (req.body?.language === "en" ? "en" : "ar") as "ar" | "en";
    const transcriptId = await enqueueTranscription(callId, scope.companyId, language);

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "submit", entity: "pbx_call_transcripts", entityId: transcriptId,
      after: { callId, language },
    }).catch((e) => logger.warn(e, "[audit] transcript.enqueued"));

    res.status(202).json({ id: transcriptId, status: "pending" });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/transcripts/enqueue");
  }
});

/**
 * POST /transcripts/run-next
 * Operator-driven worker tick — pulls one pending transcript and
 * processes it. Without an STT vendor wired, this marks the row as
 * 'failed' with STT_NOT_CONFIGURED so the operator UI surfaces the
 * gap. When a vendor is wired (in lib/pbxControl.runPendingTranscription),
 * this turns into actual transcription.
 */
router.post("/transcripts/run-next", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const result = await runPendingTranscription();
    if (!result) {
      res.json({ processed: false, message: "لا توجد عناصر في الطابور" });
      return;
    }
    res.json({ processed: true, ...result });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/transcripts/run-next");
  }
});

/**
 * POST /transcripts/:id/summarise
 * Run the existing aiEngine.summarizerSummarize against a completed
 * transcript. Writes the AI summary back into the same row and
 * updates `summarisedAt`. Cost flows through recordAiUsage().
 */
router.post("/transcripts/:id/summarise", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<{ status: string; transcript: string | null; companyId: number }>(
      `SELECT status, transcript, "companyId" FROM pbx_call_transcripts WHERE id = $1`,
      [id],
    );
    if (!row || row.companyId !== scope.companyId) {
      throw new NotFoundError("النسخة غير موجودة");
    }
    if (row.status !== "completed" || !row.transcript) {
      throw new ConflictError("الـ AI summary متاح فقط بعد اكتمال النسخ بنجاح");
    }
    const summary = await aiEngine.summarizerSummarize(
      row.transcript,
      300,
      { companyId: scope.companyId, userId: scope.userId },
    );
    await rawExecute(
      `UPDATE pbx_call_transcripts
          SET summary = $1, "summarisedAt" = NOW()
        WHERE id = $2`,
      [summary, id],
    );

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "pbx_control.transcript.summarised",
      entity: "pbx_call_transcripts", entityId: id, details: "{}",
    }).catch((e) => logger.warn(e, "[event] transcript.summarised"));

    res.json({ ok: true, summary });
  } catch (err) {
    handleRouteError(err, res, "admin/pbx-control/transcripts/summarise");
  }
});

export default router;
