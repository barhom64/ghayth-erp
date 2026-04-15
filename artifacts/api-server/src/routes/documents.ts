import { Router, type Request, type Response } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { Readable } from "stream";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

const objectStorageService = new ObjectStorageService();

const APPROVE_ROLES = ["owner", "general_manager", "admin"];

router.get("/", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { entity, entityId, category, status: docStatus } = req.query;

    if (entity && entityId) {
      const rows = await rawQuery(
        `SELECT d.* FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
         WHERE del."entityType" = $1 AND del."entityId" = $2
         AND (d."companyId" = $3 OR d."companyId" IS NULL)
         ORDER BY d."createdAt" DESC`,
        [entity, Number(entityId), scope.companyId]
      );
      res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
      return;
    }

    let where = `WHERE ("companyId"=$1 OR "companyId" IS NULL)`;
    const params: any[] = [scope.companyId];

    if (category) {
      params.push(category);
      where += ` AND category=$${params.length}`;
    }
    if (docStatus) {
      params.push(docStatus);
      where += ` AND status=$${params.length}`;
    }

    const rows = await rawQuery(`SELECT * FROM documents ${where} ORDER BY "createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { title, description, type, department, folder } = req.body;
    if (!title) {
      res.status(400).json({ error: "عنوان المستند مطلوب" });
      return;
    }
    const r = await rawExecute(
      `INSERT INTO documents (title, description, category, "fileName", "storageKey", "companyId", "uploadedBy", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
      [title, description || null, type || 'document', folder || title, `doc-${Date.now()}`, scope.companyId, scope.userId]
    );
    res.status(201).json({ id: r.insertId, title, type, department });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/upload", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { title, description, fileName, fileSize, mimeType, category, storageKey, entityLinks } = req.body;

    if (!title || !fileName || !storageKey) {
      res.status(400).json({ error: "title, fileName, and storageKey are required" });
      return;
    }

    const ALLOWED_ENTITY_TYPES = ["employee", "client", "project", "invoice", "vehicle"];
    if (entityLinks && Array.isArray(entityLinks)) {
      for (const link of entityLinks) {
        if (!link.entityType || !ALLOWED_ENTITY_TYPES.includes(link.entityType) || !Number.isInteger(Number(link.entityId))) {
          res.status(400).json({ error: `Invalid entity link: type must be one of ${ALLOWED_ENTITY_TYPES.join(", ")} and entityId must be an integer` });
          return;
        }
      }
    }

    const r = await rawExecute(
      `INSERT INTO documents (title, description, "fileName", "fileSize", "mimeType", category, status, "storageKey", "currentVersion", "uploadedBy", "companyId")
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,1,$8,$9)`,
      [title, description, fileName, fileSize, mimeType, category || null, storageKey, scope.userId, scope.companyId]
    );

    const docId = r.insertId;

    await rawExecute(
      `INSERT INTO document_versions ("documentId", "versionNumber", "fileName", "fileSize", "mimeType", "storageKey", "uploadedBy")
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [docId, fileName, fileSize, mimeType, storageKey, scope.userId]
    );

    if (entityLinks && Array.isArray(entityLinks)) {
      for (const link of entityLinks) {
        await rawExecute(
          `INSERT INTO document_entity_links ("documentId", "entityType", "entityId") VALUES ($1, $2, $3)
           ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
          [docId, link.entityType, link.entityId]
        );
      }
    }

    const [doc] = await rawQuery(`SELECT * FROM documents WHERE id=$1`, [docId]);
    res.status(201).json(doc);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/download", requirePermission("documents:download"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const [doc] = await rawQuery<any>(
      `SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [Number(req.params.id), scope.companyId]
    );
    if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    if (!doc.storageKey) {
      res.status(404).json({ error: "لا يوجد ملف مرفق" });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(doc.storageKey);
      const response = await objectStorageService.downloadObject(objectFile);

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName || 'file')}"`);
      if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
      res.status(response.status);

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch {
      res.status(404).json({ error: "الملف غير موجود في التخزين" });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// P02-S4-HIGH — `POST /:id/versions` used to read documents with the
// `("companyId"=$2 OR "companyId" IS NULL)` filter (so global system
// documents passed the precheck) and then UPDATE by raw `id` with no
// scope filter at all. That meant any tenant's user with the
// `documents:create` permission could POST a new version against a
// global system document and rewrite its `fileName`/`storageKey`/
// `mimeType` — redirecting every other tenant's downloads of that
// system document to attacker-controlled storage. Tightening both the
// precheck and the UPDATE to caller's company only; new versions of
// global/system documents must be created as company-owned documents
// via the regular create flow, not by mutating shared rows.
router.post("/:id/versions", requirePermission("documents:create"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = Number(req.params.id);
    const { fileName, fileSize, mimeType, storageKey, notes } = req.body;

    const [doc] = await rawQuery<any>(
      `SELECT * FROM documents WHERE id=$1 AND "companyId"=$2`,
      [docId, scope.companyId]
    );
    if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    const newVersion = (doc.currentVersion || 1) + 1;

    await rawExecute(
      `INSERT INTO document_versions ("documentId", "versionNumber", "fileName", "fileSize", "mimeType", "storageKey", "uploadedBy", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [docId, newVersion, fileName, fileSize, mimeType, storageKey, scope.userId, notes || null]
    );

    await rawExecute(
      `UPDATE documents SET "currentVersion"=$1, "fileName"=$2, "fileSize"=$3, "mimeType"=$4, "storageKey"=$5, "updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7`,
      [newVersion, fileName, fileSize, mimeType, storageKey, docId, scope.companyId]
    );

    const [updated] = await rawQuery(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2`, [docId, scope.companyId]);
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/versions", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = Number(req.params.id);
    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [docId, scope.companyId]
    );
    if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    const versions = await rawQuery(
      `SELECT * FROM document_versions WHERE "documentId"=$1 ORDER BY "versionNumber" DESC`,
      [docId]
    );
    res.json({ data: versions });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/:id/status", requirePermission("documents:update"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = Number(req.params.id);
    const { status } = req.body;

    if (!["draft", "approved", "cancelled"].includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }

    if (status === "approved" && !scope.isOwner && !APPROVE_ROLES.includes(scope.role || "")) {
      res.status(403).json({ error: "ليس لديك صلاحية اعتماد المستندات" });
      return;
    }

    const [beforeDoc] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [docId, scope.companyId]);
    if (!beforeDoc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    const result = await rawExecute(
      `UPDATE documents SET status=$1, "updatedAt"=NOW() WHERE id=$2 AND ("companyId"=$3 OR "companyId" IS NULL)`,
      [status, docId, scope.companyId]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    const CATEGORY_EFFECTS: Record<string, string> = {
      contracts: "التزام قانوني/مالي",
      financial: "ذمة مالية",
      official: "إجراء رسمي",
      hr: "تحديث ملف موظف",
      legal: "التزام قانوني",
    };

    const impact = status === "approved" && beforeDoc.category ? CATEGORY_EFFECTS[beforeDoc.category] || null : null;

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "documents", entityId: docId,
      before: { status: beforeDoc.status },
      after: { status, impact: impact || undefined },
    }).catch(console.error);

    const [doc] = await rawQuery(`SELECT * FROM documents WHERE id=$1`, [docId]);
    res.json({ ...(doc as any), impact });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/entity-links", requirePermission("documents:update"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.body;
    const docId = Number(req.params.id);

    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [docId, scope.companyId]
    );
    if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    await rawExecute(
      `INSERT INTO document_entity_links ("documentId", "entityType", "entityId") VALUES ($1, $2, $3)
       ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
      [docId, entityType, entityId]
    );
    res.json({ message: "تم الربط بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/entity-links", requirePermission("documents:read"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const docId = Number(req.params.id);

    const [doc] = await rawQuery<any>(
      `SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [docId, scope.companyId]
    );
    if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

    const links = await rawQuery(
      `SELECT * FROM document_entity_links WHERE "documentId"=$1`,
      [docId]
    );
    res.json({ data: links });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/folders", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/folders", requirePermission("documents:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, parentId, color } = req.body;
    const r = await rawExecute(
      `INSERT INTO document_folders (name, "parentId", color, "companyId") VALUES ($1,$2,$3,$4)`,
      [name, parentId, color, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/templates", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM document_templates WHERE ("companyId"=$1 OR "companyId" IS NULL) ORDER BY "createdAt" DESC`,
      [scope.companyId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/templates/:id", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "القالب غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/templates", requirePermission("documents:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, content, category, type, variables, htmlContent, branchId, signatureUrl } = req.body;
    const r = await rawExecute(
      `INSERT INTO document_templates (name, description, content, category, "type", "variables", "htmlContent", "branchId", "signatureUrl", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, description, content, category, type || 'letter', JSON.stringify(variables || []), htmlContent || '', branchId || null, signatureUrl || null, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/templates/:id", requirePermission("documents:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "معرف القالب غير صالح" }); return; }
    const { name, description, content, category, type, variables, htmlContent, branchId, signatureUrl, isActive } = req.body;
    if (!name) { res.status(400).json({ error: "اسم القالب مطلوب" }); return; }
    const [existing] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1`, [id]);
    if (!existing) { res.status(404).json({ error: "القالب غير موجود" }); return; }
    if (existing.companyId === null && existing.isDefault) {
      res.status(403).json({ error: "لا يمكن تعديل القوالب الافتراضية العامة" });
      return;
    }
    if (existing.companyId !== null && existing.companyId !== scope.companyId) {
      res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا القالب" });
      return;
    }
    await rawExecute(
      `UPDATE document_templates SET name=$1, description=$2, content=$3, category=$4, "type"=$5, "variables"=$6, "htmlContent"=$7, "branchId"=$8, "signatureUrl"=$9, "isActive"=$10, "updatedAt"=NOW() WHERE id=$11`,
      [name, description, content, category, type, JSON.stringify(variables || []), htmlContent, branchId || null, signatureUrl || null, isActive !== false, id]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: "حدث خطأ أثناء تحديث القالب" }); }
});

router.delete("/templates/:id", requirePermission("documents:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "معرف القالب غير صالح" }); return; }
    const [existing] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1`, [id]);
    if (!existing) { res.status(404).json({ error: "القالب غير موجود" }); return; }
    if (existing.companyId === null && existing.isDefault) {
      res.status(403).json({ error: "لا يمكن حذف القوالب الافتراضية العامة" });
      return;
    }
    if (existing.companyId !== null && existing.companyId !== scope.companyId) {
      res.status(403).json({ error: "ليس لديك صلاحية حذف هذا القالب" });
      return;
    }
    await rawExecute(`DELETE FROM document_templates WHERE id=$1`, [id]);
    res.json({ message: "تم حذف القالب بنجاح" });
  } catch (e: any) { res.status(500).json({ error: "حدث خطأ أثناء حذف القالب" }); }
});

function fillTemplate(htmlContent: string, data: Record<string, any>): string {
  return htmlContent.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split(".");
    let value: any = data;
    for (const part of parts) {
      if (value == null) return match;
      value = value[part];
    }
    return value != null ? String(value) : match;
  });
}

function buildDateContext() {
  const now = new Date();
  const todayGregorian = now.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "gregory" });
  let todayHijri = "";
  try {
    todayHijri = now.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "islamic-umalqura" });
  } catch { todayHijri = todayGregorian; }
  return { today: todayGregorian, todayHijri };
}

router.post("/templates/:id/generate", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [template] = await rawQuery<any>(`SELECT * FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]);
    if (!template) { res.status(404).json({ error: "القالب غير موجود" }); return; }

    const { entityType, entityId, customData } = req.body;
    let entityData: Record<string, any> = {};

    if (entityType === "employee" && entityId) {
      const [emp] = await rawQuery<any>(`
        SELECT e.*, d.name as "departmentName", b.name as "branchName"
        FROM employees e
        LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
        LEFT JOIN departments d ON d.id = ea."departmentId"
        LEFT JOIN branches b ON b.id = ea."branchId"
        WHERE e.id=$1
      `, [Number(entityId)]);
      if (emp) {
        entityData.employee = {
          name: emp.name,
          empNumber: emp.empNumber || emp.id,
          jobTitle: emp.jobTitle || "",
          departmentName: emp.departmentName || "",
          branchName: emp.branchName || "",
          nationality: emp.nationality || "",
          idNumber: emp.idNumber || "",
          phone: emp.phone || "",
          email: emp.email || "",
          hireDate: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("ar-SA") : "",
          endDate: emp.endDate ? new Date(emp.endDate).toLocaleDateString("ar-SA") : "",
          status: emp.status || "",
        };
        entityData.salary = {
          basic: Number(emp.salary || 0),
          housing: Number(emp.housingAllowance || 0),
          transport: Number(emp.transportAllowance || 0),
          total: Number(emp.salary || 0) + Number(emp.housingAllowance || 0) + Number(emp.transportAllowance || 0),
        };
      }
    }

    if (entityType === "invoice" && entityId) {
      const [inv] = await rawQuery<any>(`
        SELECT i.*, c.name as "clientName", c.email as "clientEmail", c.phone as "clientPhone"
        FROM invoices i
        LEFT JOIN clients c ON c.id = i."clientId"
        WHERE i.id=$1 AND i."companyId"=$2 AND i."deletedAt" IS NULL
      `, [Number(entityId), scope.companyId]);
      if (inv) {
        entityData.client = {
          name: inv.clientName || "",
          email: inv.clientEmail || "",
          phone: inv.clientPhone || "",
          company: inv.clientName || "",
        };
        entityData.quotation = {
          ref: inv.ref || `INV-${inv.id}`,
          subtotal: Number(inv.subtotal || inv.total || 0),
          vat: Number(inv.vatAmount || 0),
          total: Number(inv.total || 0),
          validUntil: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("ar-SA") : "",
          notes: inv.notes || "",
          items: "",
        };
      }
    }

    const [company] = await rawQuery<any>(`SELECT * FROM companies WHERE id=$1`, [scope.companyId]);
    entityData.company = { name: company?.name || "", nameEn: company?.nameEn || "" };
    entityData.date = buildDateContext();

    if (customData) {
      for (const [key, value] of Object.entries(customData)) {
        const parts = key.split(".");
        if (parts.length === 2) {
          if (!entityData[parts[0]]) entityData[parts[0]] = {};
          entityData[parts[0]][parts[1]] = value;
        } else {
          entityData[key] = value;
        }
      }
    }

    const htmlContent = template.htmlContent || template.content || "";
    const filledHtml = fillTemplate(htmlContent, entityData);

    let branchData = null;
    const branchId = template.branchId || scope.branchId;
    if (branchId) {
      const [branch] = await rawQuery<any>(`SELECT * FROM branches WHERE id=$1`, [branchId]);
      if (branch) {
        branchData = {
          name: branch.name,
          nameEn: branch.nameEn,
          logoUrl: branch.logoUrl,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          website: branch.website,
          taxNumber: branch.taxNumber,
          crNumber: branch.crNumber,
          footerText: branch.footerText,
          city: branch.city,
        };
      }
    }

    res.json({
      html: filledHtml,
      templateName: template.name,
      branch: branchData,
      signatureUrl: template.signatureUrl,
      variables: entityData,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/templates/:id/variables", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [template] = await rawQuery<any>(`SELECT variables FROM document_templates WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]);
    if (!template) { res.status(404).json({ error: "القالب غير موجود" }); return; }
    let variables = [];
    try { variables = typeof template.variables === "string" ? JSON.parse(template.variables) : (template.variables || []); } catch { variables = []; }
    res.json({ variables });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [docs] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [folders] = await rawQuery(`SELECT COUNT(*) as count FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [templates] = await rawQuery(`SELECT COUNT(*) as count FROM document_templates WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [drafts] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND status='draft'`, [cid]);
    const [approved] = await rawQuery(`SELECT COUNT(*) as count FROM documents WHERE ("companyId"=$1 OR "companyId" IS NULL) AND status='approved'`, [cid]);
    res.json({
      totalDocuments: Number(docs.count),
      totalFolders: Number(folders.count),
      totalTemplates: Number(templates.count),
      draftDocuments: Number(drafts.count),
      approvedDocuments: Number(approved.count),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id", requirePermission("documents:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المستند غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/:id", requirePermission("documents:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.fileName !== undefined) { params.push(b.fileName); sets.push(`"fileName"=$${params.length}`); }
    if (b.fileUrl !== undefined) { params.push(b.fileUrl); sets.push(`"fileUrl"=$${params.length}`); }
    if (b.folderId !== undefined) { params.push(b.folderId); sets.push(`"folderId"=$${params.length}`); }
    if (b.tags !== undefined) { params.push(b.tags); sets.push(`tags=$${params.length}`); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE documents SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المستند غير موجود" }); return; }
    const [row] = await rawQuery<any>(`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id", requirePermission("documents:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM documents WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المستند غير موجود" }); return; }
    res.json({ message: "تم حذف المستند بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
