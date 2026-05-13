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
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { logger } from "../lib/logger.js";

interface VendorContractRow {
  id: number;
  companyId: number;
  vendorId: number;
  title: string;
  startDate: string | null;
  endDate: string;
  status: "active" | "expired" | "terminated" | "pending";
  contractValue: string | number | null;
  currency: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VendorContractWithVendorRow extends VendorContractRow {
  vendorName: string | null;
}

const dateOrIso = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "تاريخ غير صحيح (YYYY-MM-DD)");

const createSchema = z.object({
  vendorId: z.number().int().positive(),
  title: z.string().min(1, "عنوان العقد مطلوب").max(500),
  startDate: dateOrIso.optional().nullable(),
  endDate: dateOrIso,
  status: z.enum(["active", "expired", "terminated", "pending"]).optional().default("active"),
  contractValue: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().length(3).optional().default("SAR"),
  notes: z.string().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  startDate: dateOrIso.optional().nullable(),
  endDate: dateOrIso.optional(),
  status: z.enum(["active", "expired", "terminated", "pending"]).optional(),
  contractValue: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional().nullable(),
});

export const vendorContractsRouter = Router();

vendorContractsRouter.get(
  "/contracts",
  authorize({ feature: "finance.contracts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const filters = parseScopeFilters(req);
      const { where, params } = buildScopedWhere(scope, filters, { softDeleteColumn: 'vc."deletedAt"' });
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const vendorIdRaw = typeof req.query.vendorId === "string" ? req.query.vendorId : null;

      let extraWhere = "";
      if (status) {
        params.push(status);
        extraWhere += ` AND vc.status = $${params.length}`;
      }
      if (vendorIdRaw) {
        const vid = parseInt(vendorIdRaw, 10);
        if (!Number.isNaN(vid)) {
          params.push(vid);
          extraWhere += ` AND vc."vendorId" = $${params.length}`;
        }
      }

      const rows = await rawQuery<VendorContractWithVendorRow>(
        `SELECT vc.*, s.name AS "vendorName"
         FROM vendor_contracts vc
         LEFT JOIN suppliers s ON s.id = vc."vendorId" AND s."deletedAt" IS NULL
         WHERE ${where.replace(/"deletedAt"/g, 'vc."deletedAt"').replace(/"companyId"/g, 'vc."companyId"')}${extraWhere}
         ORDER BY vc."endDate" ASC
         LIMIT 500`,
        params
      );
      res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
    } catch (err) {
      handleRouteError(err, res, "List vendor contracts error:");
    }
  }
);

vendorContractsRouter.get(
  "/contracts/:id",
  authorize({ feature: "finance.contracts", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<VendorContractWithVendorRow>(
        `SELECT vc.*, s.name AS "vendorName"
         FROM vendor_contracts vc
         LEFT JOIN suppliers s ON s.id = vc."vendorId" AND s."deletedAt" IS NULL
         WHERE vc.id = $1 AND vc."companyId" = $2 AND vc."deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      if (!row) throw new NotFoundError("العقد غير موجود");
      res.json(maskFields(req, row));
    } catch (err) {
      handleRouteError(err, res, "Get vendor contract error:");
    }
  }
);

vendorContractsRouter.post(
  "/contracts",
  authorize({ feature: "finance.contracts", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(createSchema.safeParse(req.body ?? {}));

      const [vendor] = await rawQuery<{ id: number }>(
        `SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [body.vendorId, scope.companyId]
      );
      if (!vendor) {
        throw new ValidationError("المورد غير موجود أو محذوف", { field: "vendorId" });
      }

      if (body.startDate && body.startDate > body.endDate) {
        throw new ValidationError("تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية", {
          field: "endDate",
        });
      }

      const { insertId } = await rawExecute(
        `INSERT INTO vendor_contracts
           ("companyId", "vendorId", title, "startDate", "endDate", status,
            "contractValue", currency, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          scope.companyId,
          body.vendorId,
          body.title,
          body.startDate ?? null,
          body.endDate,
          body.status,
          body.contractValue ?? null,
          body.currency,
          body.notes ?? null,
        ]
      );
      assertInsert(insertId, "vendor_contracts");

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "vendor_contract.created",
        entity: "vendor_contracts",
        entityId: insertId,
        details: JSON.stringify({ vendorId: body.vendorId, title: body.title, endDate: body.endDate }),
      }).catch((e) => logger.error(e, "[event] vendor_contract.created"));

      createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "create",
        entity: "vendor_contracts",
        entityId: insertId,
        after: body,
      }).catch((e) => logger.error(e, "[audit] vendor_contract.created"));

      const [row] = await rawQuery<VendorContractRow>(
        `SELECT * FROM vendor_contracts WHERE id = $1 AND "companyId" = $2`,
        [insertId, scope.companyId]
      );
      res.status(201).json(row ?? { id: insertId, ...body });
    } catch (err) {
      handleRouteError(err, res, "Create vendor contract error:");
    }
  }
);

vendorContractsRouter.patch(
  "/contracts/:id",
  authorize({ feature: "finance.contracts", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(updateSchema.safeParse(req.body ?? {}));

      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      const setIfDefined = (col: string, val: unknown) => {
        if (val !== undefined) {
          sets.push(`"${col}" = $${idx++}`);
          params.push(val);
        }
      };
      setIfDefined("title", body.title);
      setIfDefined("startDate", body.startDate);
      setIfDefined("endDate", body.endDate);
      setIfDefined("status", body.status);
      setIfDefined("contractValue", body.contractValue);
      setIfDefined("currency", body.currency);
      setIfDefined("notes", body.notes);

      if (sets.length === 0) {
        throw new ValidationError("لا توجد بيانات للتحديث", {
          field: "body",
          fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
        });
      }

      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);

      const [row] = await rawQuery<VendorContractRow>(
        `UPDATE vendor_contracts SET ${sets.join(", ")}
         WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL
         RETURNING *`,
        params
      );
      if (!row) throw new NotFoundError("العقد غير موجود");

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "vendor_contract.updated",
        entity: "vendor_contracts",
        entityId: id,
        details: JSON.stringify(body),
      }).catch((e) => logger.error(e, "[event] vendor_contract.updated"));

      createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "update",
        entity: "vendor_contracts",
        entityId: id,
        after: body,
      }).catch((e) => logger.error(e, "[audit] vendor_contract.updated"));

      res.json(row);
    } catch (err) {
      handleRouteError(err, res, "Update vendor contract error:");
    }
  }
);

vendorContractsRouter.delete(
  "/contracts/:id",
  authorize({ feature: "finance.contracts", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE vendor_contracts SET "deletedAt" = NOW()
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      if (affectedRows === 0) throw new NotFoundError("العقد غير موجود");

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "vendor_contract.deleted",
        entity: "vendor_contracts",
        entityId: id,
      }).catch((e) => logger.error(e, "[event] vendor_contract.deleted"));

      createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "delete",
        entity: "vendor_contracts",
        entityId: id,
      }).catch((e) => logger.error(e, "[audit] vendor_contract.deleted"));

      res.status(204).send();
    } catch (err) {
      handleRouteError(err, res, "Delete vendor contract error:");
    }
  }
);
