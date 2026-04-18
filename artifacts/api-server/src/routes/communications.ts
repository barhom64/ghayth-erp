import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { sendNotification } from "../lib/notificationService.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { aiEngine } from "../lib/aiEngine.js";
import { sendPushToCompany, getVapidPublicKey } from "../lib/pushService.js";
import { encryptPushEndpoint, hashPushEndpoint, decryptPushEndpoint } from "../lib/pushCrypto.js";

export { decryptPushEndpoint as decryptEndpoint };

const router = Router();

const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "ghayth_erp_verify";
const WA_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? "";

async function matchSenderToEntity(phone: string, companyId: number): Promise<{ type: "client" | "employee" | "unknown"; id: number | null; name: string }> {
  const normalizedPhone = phone.replace(/\D/g, "").slice(-9);

  const clients = await rawQuery<{ id: number; name: string }>(
    `SELECT id, name FROM clients WHERE "companyId"=$1 AND REPLACE(REPLACE(phone,'+',''),'-','') LIKE $2`,
    [companyId, `%${normalizedPhone}`]
  );
  if (clients.length > 0) {
    return { type: "client", id: clients[0]!.id, name: clients[0]!.name };
  }

  const employees = await rawQuery<{ id: number; name: string }>(
    `SELECT e.id, e.name FROM employees e
     JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
     WHERE REPLACE(REPLACE(e.phone,'+',''),'-','') LIKE $2`,
    [companyId, `%${normalizedPhone}`]
  );
  if (employees.length > 0) {
    return { type: "employee", id: employees[0]!.id, name: employees[0]!.name };
  }

  return { type: "unknown", id: null, name: phone };
}

async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_ID) {
    console.log(`[WhatsApp] Would send to ${to}: ${message}`);
    return false;
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );
    return resp.ok;
  } catch (err) {
    console.error("[WhatsApp] Send error:", err);
    return false;
  }
}

router.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: "Verification failed" });
  }
});

router.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  try {
    res.status(200).json({ status: "ok" });

    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return;

    for (const message of value.messages) {
      const from = message.from as string;
      const msgId = message.id as string;
      const msgType = message.type as string;
      const msgText = msgType === "text" ? (message.text?.body as string) : "[media message]";
      const timestamp = new Date(Number(message.timestamp) * 1000).toISOString();

      const metaPhoneId = value.metadata?.phone_number_id as string | undefined;
      let companyId: number | undefined;
      if (metaPhoneId) {
        const byPhoneId = await rawQuery<{ id: number }>(
          `SELECT "companyId" AS id FROM integrations
           WHERE type='whatsapp' AND (settings->>'phoneNumberId')=$1 AND "isActive"=true LIMIT 1`,
          [metaPhoneId]
        );
        if (byPhoneId.length > 0) companyId = byPhoneId[0]!.id;
      }
      if (!companyId) {
        const displayPhone = value.metadata?.display_phone_number as string | undefined;
        if (displayPhone) {
          const normalized = displayPhone.replace(/\D/g, "").slice(-9);
          const byDisplayPhone = await rawQuery<{ id: number }>(
            `SELECT id FROM companies WHERE REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-','') LIKE $1 LIMIT 1`,
            [`%${normalized}`]
          );
          if (byDisplayPhone.length > 0) companyId = byDisplayPhone[0]!.id;
        }
      }
      if (!companyId) {
        console.warn(`[WhatsApp] Could not resolve companyId for phone_number_id=${metaPhoneId ?? "unknown"} display=${value.metadata?.display_phone_number ?? "unknown"} — message from ${from} dropped (unmapped tenant)`);
        continue;
      }

      const sender = await matchSenderToEntity(from, companyId);

      await rawExecute(
        `INSERT INTO communications_log ("companyId",channel,direction,"fromNumber","toNumber",subject,body,status,"relatedType","relatedId","createdAt")
         VALUES ($1,'whatsapp','inbound',$2,'',$3,$4,'received',$5,$6,NOW())`,
        [companyId, from, `WhatsApp from ${sender.name}`, msgText, sender.type !== "unknown" ? sender.type : null, sender.id]
      );

      const categorized = await aiEngine.receptionCategorize(msgText, `Sender: ${sender.name} (${sender.type})`);

      let relatedType: string | null = null;
      let relatedId: number | null = null;

      if (categorized.category === "support" || categorized.priority === "urgent") {
        const { insertId } = await rawExecute(
          `INSERT INTO support_tickets ("companyId",title,description,status,priority,"createdAt")
           VALUES ($1,$2,$3,'open',$4,NOW())`,
          [companyId, `WhatsApp: ${msgText.substring(0, 100)}`, `${msgText}\n\nمن: ${sender.name} (${from})`, categorized.priority]
        );
        relatedType = "support_ticket";
        relatedId = insertId;
      } else if (sender.type === "unknown" && categorized.category === "crm") {
        const { insertId } = await rawExecute(
          `INSERT INTO crm_opportunities ("companyId",title,stage,status,"createdAt")
           VALUES ($1,$2,'lead','active',NOW())`,
          [companyId, `WhatsApp Lead: ${sender.name}`]
        );
        relatedType = "crm_opportunity";
        relatedId = insertId;
      }

      const ackMessage = `مرحباً ${sender.name !== from ? sender.name : ""}، شكراً لتواصلك معنا. سنقوم بالرد عليك في أقرب وقت ممكن. رقم طلبك: WA-${msgId.substring(0, 8)}`;
      await sendWhatsAppMessage(from, ackMessage);

      await rawExecute(
        `INSERT INTO whatsapp_queue ("companyId",phone,"recipientName","clientId","assignmentId",message,status,"createdAt")
         VALUES ($1,$2,$3,$4,NULL,$5,'sent',NOW())`,
        [companyId, from, sender.name, sender.type === "client" ? sender.id : null, ackMessage]
      );

      if (relatedType && relatedId) {
        await sendNotification({
          companyId,
          type: "support",
          title: `رسالة واتساب جديدة من ${sender.name}`,
          body: msgText.substring(0, 200),
          priority: categorized.priority === "urgent" ? "urgent" : "high",
          targetRole: "admin",
          refType: relatedType,
          refId: relatedId,
        });
      }
    }
  } catch (err) {
    console.error("[WhatsApp] Webhook error:", err);
  }
});

router.post("/pbx/incoming", async (req, res): Promise<void> => {
  try {
    const b = req.body;
    const callerNumber = b.callerNumber ?? b.from ?? "";
    const calledNumber = b.calledNumber ?? b.to ?? "";
    const callId = b.callId ?? b.CallSid ?? `CALL-${Date.now()}`;
    const direction = b.direction ?? "inbound";

    const normalizedCalledNumber = calledNumber.replace(/\D/g, "").slice(-9);
    let pbxCompanyId: number | undefined;
    if (normalizedCalledNumber) {
      const byDid = await rawQuery<{ id: number }>(
        `SELECT "companyId" AS id FROM integrations
         WHERE type='pbx' AND (settings->>'did') LIKE $1 AND "isActive"=true LIMIT 1`,
        [`%${normalizedCalledNumber}`]
      );
      if (byDid.length > 0) pbxCompanyId = byDid[0]!.id;
    }
    if (!pbxCompanyId) {
      const byCompanyPhone = await rawQuery<{ id: number }>(
        `SELECT id FROM companies WHERE REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-','') LIKE $1 LIMIT 1`,
        [`%${normalizedCalledNumber}`]
      );
      if (byCompanyPhone.length > 0) pbxCompanyId = byCompanyPhone[0]!.id;
    }
    if (!pbxCompanyId) {
      console.warn(`[PBX] Could not resolve companyId for calledNumber=${calledNumber} — call from ${callerNumber} dropped (unmapped tenant)`);
      res.status(200).json({ status: "ok", warning: "company not mapped to this DID" });
      return;
    }
    const companyId = pbxCompanyId;

    const sender = await matchSenderToEntity(callerNumber, companyId);

    const { insertId: pbxId } = await rawExecute(
      `INSERT INTO pbx_calls ("companyId","callId","callerNumber","calledNumber",direction,status,"createdAt")
       VALUES ($1,$2,$3,$4,$5,'ringing',NOW())`,
      [companyId, callId, callerNumber, calledNumber, direction]
    );

    await rawExecute(
      `INSERT INTO communications_log ("companyId",channel,direction,"fromNumber","toNumber",subject,body,status,"relatedType","relatedId","createdAt")
       VALUES ($1,'pbx',$2,$3,$4,$5,$6,'received','pbx_call',$7,NOW())`,
      [companyId, direction, callerNumber, calledNumber, `PBX Call from ${sender.name}`, `Incoming call from ${callerNumber} identified as ${sender.name} (${sender.type})`, pbxId]
    );

    await sendNotification({
      companyId,
      type: "system",
      title: `مكالمة واردة من ${sender.name}`,
      body: `${callerNumber} يتصل بـ ${calledNumber}`,
      priority: "high",
      targetRole: "admin",
      refType: "pbx_call",
      refId: pbxId,
    });

    res.status(200).json({
      status: "ok",
      callId,
      pbxLogId: pbxId,
      callerInfo: {
        phone: callerNumber,
        name: sender.name,
        type: sender.type,
        id: sender.id,
      },
      action: "route_to_agent",
    });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Incoming error:");
  }
});

router.post("/pbx/completed", async (req, res): Promise<void> => {
  try {
    const b = req.body;
    const callId = b.callId ?? b.CallSid ?? "";
    const duration = Number(b.duration ?? b.CallDuration ?? 0);
    const status = b.status ?? (duration > 0 ? "completed" : "no_answer");
    const recordingUrl = b.recordingUrl ?? b.RecordingUrl ?? null;

    const [call] = await rawQuery<{ id: number; callerNumber: string; companyId: number }>(
      `SELECT id, "callerNumber", "companyId" FROM pbx_calls WHERE "callId"=$1`,
      [callId]
    );
    if (!call) { res.status(200).json({ status: "ok" }); return; }
    const companyId = call.companyId;

    await rawExecute(
      `UPDATE pbx_calls SET status=$1, duration=$2, "recordingUrl"=$3 WHERE id=$4`,
      [status, duration, recordingUrl, call.id]
    );

    if (status === "no_answer" || duration === 0) {
      const sender = await matchSenderToEntity(call.callerNumber, companyId);

      await rawExecute(
        `INSERT INTO tasks ("companyId",title,description,status,priority,"createdAt")
         VALUES ($1,$2,$3,'pending','high',NOW())`,
        [
          companyId,
          `رد على مكالمة من ${sender.name}`,
          `اتصل ${sender.name} (${call.callerNumber}) ولم يتم الرد. يرجى الاتصال مرة أخرى.\nمعرف المكالمة: ${callId}`,
        ]
      );

      await sendNotification({
        companyId,
        type: "system",
        title: `مكالمة فائتة من ${sender.name}`,
        body: `${call.callerNumber} اتصل ولم يتم الرد - تم إنشاء مهمة للمتابعة`,
        priority: "high",
        targetRole: "admin",
        refType: "pbx_call",
        refId: call.id,
      });
    }

    res.status(200).json({ status: "ok", callId, duration, callStatus: status });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Completed error:");
  }
});

router.post("/pbx/status", async (req, res): Promise<void> => {
  try {
    const { callId, status, answeredBy } = req.body;
    if (!callId) res.status(400).json({ error: "callId مطلوب" }); return;

    await rawExecute(
      `UPDATE pbx_calls SET status=$1, "answeredBy"=$2 WHERE "callId"=$3`,
      [status ?? "in_progress", answeredBy ?? null, callId]
    );

    res.status(200).json({ status: "ok" });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Status update error:");
  }
});

router.use(authMiddleware);

router.get("/log", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { channel, direction } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (channel) { params.push(channel); conditions.push(`channel = $${params.length}`); }
    if (direction) { params.push(direction); conditions.push(`direction = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM communications_log WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 200`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Communications log error:"); }
});

router.post("/send", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.channel) {
      throw new ValidationError("قناة المراسلة مطلوبة", {
        field: "channel",
        fix: "اختر القناة (whatsapp | sms | email | call)",
      });
    }
    const validChannels = ["whatsapp", "sms", "email", "call", "push"];
    if (!validChannels.includes(String(b.channel).toLowerCase())) {
      throw new ValidationError(`قناة غير مدعومة: ${b.channel}`, {
        field: "channel",
        fix: `اختر قناة من: ${validChannels.join(", ")}`,
      });
    }
    if (!b.toNumber && !b.toEmail) {
      throw new ValidationError("المستلم مطلوب", {
        field: "toNumber",
        fix: "أدخل رقم المستلم أو بريده الإلكتروني",
      });
    }
    if (!b.body || !String(b.body).trim()) {
      throw new ValidationError("محتوى الرسالة مطلوب", {
        field: "body",
        fix: "اكتب نص الرسالة",
      });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO communications_log ("companyId",channel,direction,"fromNumber","toNumber",subject,body,status,"relatedType","relatedId") VALUES ($1,$2,'outbound',$3,$4,$5,$6,'queued',$7,$8)`,
      [scope.companyId, String(b.channel).toLowerCase(), b.fromNumber ?? null, b.toNumber ?? b.toEmail, b.subject ?? null, String(b.body).trim(), b.relatedType ?? null, b.relatedId ?? null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM communications_log WHERE id=$1`, [insertId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "communications_log", entityId: insertId, after: { channel: String(b.channel).toLowerCase(), toNumber: b.toNumber ?? b.toEmail } }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Send communication error:"); }
});

router.get("/whatsapp", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM whatsapp_queue WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "WhatsApp queue error:"); }
});

router.get("/sms", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM sms_queue WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "SMS queue error:"); }
});

router.get("/pbx", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM pbx_calls WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 200`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "PBX calls error:"); }
});

router.patch("/log/:id", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { body, content, subject, direction, status } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const finalBody = body ?? content;
    if (finalBody !== undefined) { sets.push(`body = $${idx++}`); params.push(finalBody); }
    if (subject !== undefined) { sets.push(`subject = $${idx++}`); params.push(subject); }
    if (direction !== undefined) { sets.push(`direction = $${idx++}`); params.push(direction); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE communications_log SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "السجل غير موجود" }); return; }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "communications_log", entityId: Number(req.params.id) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/log/:id/convert", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const logId = Number(req.params.id);
    const { targetType } = req.body;

    if (!["task", "ticket", "request"].includes(targetType)) {
      res.status(400).json({ error: "نوع التحويل غير صالح. المتاح: task, ticket, request" });
      return;
    }

    const [logEntry] = await rawQuery<any>(
      `SELECT * FROM communications_log WHERE id=$1 AND "companyId"=$2`,
      [logId, scope.companyId]
    );
    if (!logEntry) { res.status(404).json({ error: "سجل الاتصال غير موجود" }); return; }

    let createdId: number | null = null;
    let targetPath = "";

    const commTitle = logEntry.subject || `اتصال ${logEntry.channel} من ${logEntry.fromNumber || "مجهول"}`;
    const commDesc = logEntry.body || logEntry.subject || "";

    const prefixMap: Record<string, string> = { task: "متابعة", ticket: "دعم", request: "طلب" };
    const fullTitle = `${prefixMap[targetType]}: ${commTitle}`;
    const fullDesc = `مصدر: ${logEntry.channel} — من: ${logEntry.fromNumber || "-"}\n${commDesc}`;

    if (targetType === "task") {
      const { insertId } = await rawExecute(
        `INSERT INTO project_tasks ("companyId", title, description, status, priority)
         VALUES ($1, $2, $3, 'todo', 'medium')`,
        [scope.companyId, fullTitle, fullDesc]
      );
      createdId = insertId;
      targetPath = "/projects/tasks";
    } else if (targetType === "ticket") {
      const { insertId } = await rawExecute(
        `INSERT INTO support_tickets ("companyId", title, description, status, priority, ref, "clientName")
         VALUES ($1, $2, $3, 'open', 'medium', $4, $5)`,
        [scope.companyId, fullTitle, fullDesc, `TKT-COMM-${logId}`, logEntry.fromNumber || "من اتصال"]
      );
      createdId = insertId;
      targetPath = "/support/tickets";
    } else {
      const { insertId } = await rawExecute(
        `INSERT INTO requests ("companyId", title, description, status, priority, "requesterName")
         VALUES ($1, $2, $3, 'pending', 'medium', $4)`,
        [scope.companyId, fullTitle, fullDesc, logEntry.fromNumber || "من اتصال"]
      );
      createdId = insertId;
      targetPath = "/requests";
    }

    try {
      await rawExecute(
        `UPDATE communications_log SET "relatedType"=$1, "relatedId"=$2 WHERE id=$3`,
        [targetType, createdId, logId]
      );
    } catch {
      // relatedType/relatedId columns may not exist yet — conversion still succeeded
    }

    const typeLabels: Record<string, string> = { task: "مهمة متابعة", ticket: "تذكرة دعم", request: "طلب داخلي" };
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: targetType, entityId: createdId!, after: { sourceLogId: logId, targetType } }).catch(console.error);
    res.json({
      success: true,
      message: `تم تحويل الاتصال إلى ${typeLabels[targetType]}`,
      createdId,
      targetType,
      targetPath,
    });
  } catch (err) { handleRouteError(err, res, "Communication convert error:"); }
});

router.delete("/log/:id", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [before] = await rawQuery<any>(`SELECT * FROM communications_log WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const [row] = await rawQuery<any>(
      `DELETE FROM communications_log WHERE id = $1 AND "companyId" = $2 RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "السجل غير موجود" }); return; }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "communications_log", entityId: id, before }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/stats", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [comm] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE channel='whatsapp') as whatsapp, COUNT(*) FILTER (WHERE channel='sms') as sms, COUNT(*) FILTER (WHERE channel='email') as email, COUNT(*) FILTER (WHERE channel='pbx') as pbx FROM communications_log WHERE "companyId"=$1`, [cid]);
    const [wa] = await rawQuery<any>(`SELECT COUNT(*) as pending FROM whatsapp_queue WHERE "companyId"=$1 AND status='pending'`, [cid]);
    const [sms] = await rawQuery<any>(`SELECT COUNT(*) as pending FROM sms_queue WHERE "companyId"=$1 AND status='pending'`, [cid]);
    res.json({
      total: Number(comm.total),
      whatsapp: Number(comm.whatsapp),
      sms: Number(comm.sms),
      email: Number(comm.email),
      pbx: Number(comm.pbx),
      pendingWhatsApp: Number(wa.pending),
      pendingSms: Number(sms.pending),
    });
  } catch (err) { handleRouteError(err, res, "Communications stats error:"); }
});

router.get("/queue-stats", requirePermission("communications:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const buildDateFilter = (alias: string, params: unknown[]): string => {
      const conditions: string[] = [];
      if (dateFrom) { params.push(dateFrom); conditions.push(`${alias}."createdAt" >= $${params.length}::date`); }
      if (dateTo) { params.push(dateTo); conditions.push(`${alias}."createdAt" < ($${params.length}::date + INTERVAL '1 day')`); }
      return conditions.length ? " AND " + conditions.join(" AND ") : "";
    };

    type StatusCount = { status: string; count: string };
    type QueueRow = { id: number; recipient: string; message: string; status: string; attemptCount: number | null; errorMessage: string | null; createdAt: string; sentAt: string | null };

    const smsParams: unknown[] = [cid];
    const smsStats = await rawQuery<StatusCount>(
      `SELECT status, COUNT(*) as count FROM sms_queue WHERE "companyId"=$1${buildDateFilter("sms_queue", smsParams)} GROUP BY status`,
      smsParams
    );
    const waParams: unknown[] = [cid];
    const waStats = await rawQuery<StatusCount>(
      `SELECT status, COUNT(*) as count FROM whatsapp_queue WHERE "companyId"=$1${buildDateFilter("whatsapp_queue", waParams)} GROUP BY status`,
      waParams
    );
    const emailParams: unknown[] = [cid];
    const emailStats = await rawQuery<StatusCount>(
      `SELECT status, COUNT(*) as count FROM email_queue WHERE "companyId"=$1${buildDateFilter("email_queue", emailParams)} GROUP BY status`,
      emailParams
    );
    const pushCount = await rawQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM push_subscriptions WHERE "companyId"=$1`,
      [cid]
    );

    const recentSms = await rawQuery<QueueRow>(
      `SELECT id, "recipientPhone" AS recipient, message, status, "attemptCount", "errorMessage", "createdAt", "sentAt"
       FROM sms_queue WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 20`,
      [cid]
    );
    const recentWa = await rawQuery<QueueRow>(
      `SELECT id, phone AS recipient, message, status, "attemptCount", "errorMessage", "createdAt", "sentAt"
       FROM whatsapp_queue WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 20`,
      [cid]
    );

    const toMap = (rows: StatusCount[]): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const r of rows) m[r.status] = Number(r.count);
      return m;
    };

    res.json({
      sms: toMap(smsStats),
      whatsapp: toMap(waStats),
      email: toMap(emailStats),
      pushSubscribers: Number(pushCount[0]?.count ?? 0),
      recentSms,
      recentWhatsapp: recentWa,
    });
  } catch (err) { handleRouteError(err, res, "Queue stats error:"); }
});

router.get("/push/vapid-key", async (_req, res): Promise<void> => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "VAPID keys not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "بيانات الاشتراك غير مكتملة" });
      return;
    }

    const userAgent = req.headers["user-agent"]?.substring(0, 200) ?? null;
    const { encrypted: encryptedEndpoint, success: isEncrypted } = encryptPushEndpoint(endpoint);
    const endpointHash = hashPushEndpoint(endpoint);

    await rawExecute(
      `INSERT INTO push_subscriptions ("companyId", "assignmentId", endpoint, "endpointHash", "p256dh", auth, "userAgent", "endpointEncrypted", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT ("companyId", "endpointHash") DO UPDATE SET
         "assignmentId" = EXCLUDED."assignmentId",
         endpoint = EXCLUDED.endpoint,
         "p256dh" = EXCLUDED."p256dh",
         auth = EXCLUDED.auth,
         "endpointEncrypted" = EXCLUDED."endpointEncrypted",
         "updatedAt" = NOW()`,
      [scope.companyId, scope.activeAssignmentId ?? null, encryptedEndpoint, endpointHash, keys.p256dh, keys.auth, userAgent, isEncrypted]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "push_subscriptions", entityId: 0 }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Push subscribe error:"); }
});

router.delete("/push/unsubscribe", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { endpoint } = req.body as { endpoint: string };

    if (!endpoint) {
      res.status(400).json({ error: "endpoint مطلوب" });
      return;
    }

    const endpointHash = hashPushEndpoint(endpoint);
    await rawExecute(
      `DELETE FROM push_subscriptions
       WHERE "companyId" = $1 AND ("endpointHash" = $2 OR (endpoint = $3 AND "endpointHash" IS NULL))`,
      [scope.companyId, endpointHash, endpoint]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "push_subscriptions", entityId: 0 }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Push unsubscribe error:"); }
});

router.post("/push/test", requirePermission("communications:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const result = await sendPushToCompany(
      scope.companyId,
      scope.activeAssignmentId ?? null,
      "اختبار الإشعارات",
      "تم تفعيل إشعارات المتصفح بنجاح! ستصلك الإشعارات حتى بدون فتح التطبيق.",
      { type: "test" }
    );
    res.json({ success: true, ...result });
  } catch (err) { handleRouteError(err, res, "Push test error:"); }
});

export default router;
