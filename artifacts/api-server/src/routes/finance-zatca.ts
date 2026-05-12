import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, toDateISO } from "../lib/businessHelpers.js";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { logger } from "../lib/logger.js";

export const zatcaRouter = Router();
zatcaRouter.use(authMiddleware);

interface ZatcaSettingsRow {
  id: number;
  companyId: number;
  enabled: boolean;
  environment: string;
  vatRegistrationNumber: string | null;
  crNumber: string | null;
  organizationName: string | null;
  organizationNameEn: string | null;
  streetName: string | null;
  buildingNumber: string | null;
  cityName: string | null;
  postalCode: string | null;
  countryCode: string | null;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  csid: string | null;
  pihKey: string | null;
  lastConnectionTest: string | null;
  connectionTestStatus: string | null;
  connectionTestMessage: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ZatcaSettingsIdRow { id: number }

interface ZatcaInvoiceRow {
  id: number;
  companyId: number;
  ref: string;
  total: number | string;
  subtotal: number | string | null;
  vatAmount: number | string | null;
  vatRate: number | string | null;
  description: string | null;
  notes: string | null;
  status: string;
  clientName: string | null;
  clientVat: string | null;
  branchName: string | null;
  branchVat: string | null;
  isTaxLinked: boolean | null;
  invoiceTypeCode: string | null;
  taxCategoryCode: string | null;
  exemptionReason: string | null;
  zatcaQrCode: string | null;
  zatcaHash: string | null;
  zatcaUuid: string | null;
  zatcaStatus: string | null;
  zatcaCleared: boolean;
  createdAt: string;
}

interface ZatcaInvoiceLineRow {
  id: number;
  invoiceId: number;
  description: string | null;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
  vatRate: number | string | null;
  vatAmount: number | string | null;
}

interface ZatcaLogRow {
  id: number;
  companyId: number;
  invoiceId: number | null;
  expenseId: number | null;
  operationType: string;
  status: string;
  request: unknown;
  response: unknown;
  errorMessage: string | null;
  createdAt: string;
}

interface ZatcaExpenseRow {
  id: number;
  companyId: number;
  ref: string;
  amount: number | string;
  vatAmount: number | string;
  vendorName: string | null;
  vendorVatNumber: string | null;
  zatcaQrCode: string | null;
  zatcaUuid: string | null;
  taxCategory: string | null;
  description: string | null;
  isTaxLinked: boolean | null;
  type: string | null;
  createdAt: string;
}

interface ZatcaStatsRow {
  accepted: string | number;
  rejected: string | number;
  pending: string | number;
  total: string | number;
}

interface CountTotalRow { total: string | number }

const zatcaSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  environment: z.string().default("sandbox"),
  vatRegistrationNumber: z.string().optional().nullable(),
  crNumber: z.string().optional().nullable(),
  organizationName: z.string().optional().nullable(),
  organizationNameEn: z.string().optional().nullable(),
  streetName: z.string().optional().nullable(),
  buildingNumber: z.string().optional().nullable(),
  cityName: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  countryCode: z.string().default("SA"),
  oauthClientId: z.string().optional().nullable(),
  oauthClientSecret: z.string().optional().nullable(),
  csid: z.string().optional().nullable(),
  pihKey: z.string().optional().nullable(),
});

const zatcaInvoicePatchSchema = z.object({
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
});

const zatcaExpensePatchSchema = z.object({
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TLV (Tag-Length-Value) QR Code Encoder — ZATCA compliant
// ─────────────────────────────────────────────────────────────────────────────
function encodeTLV(tag: number, value: string): Buffer {
  const valueBytes = Buffer.from(value, "utf8");
  const tlv = Buffer.alloc(2 + valueBytes.length);
  tlv[0] = tag;
  tlv[1] = valueBytes.length;
  valueBytes.copy(tlv, 2);
  return tlv;
}

function generateZatcaTlv(params: {
  sellerName: string;
  vatRegNumber: string;
  invoiceDate: string;
  totalAmount: string;
  vatAmount: string;
}): string {
  const { sellerName, vatRegNumber, invoiceDate, totalAmount, vatAmount } = params;
  const tlvBuffers = [
    encodeTLV(1, sellerName),
    encodeTLV(2, vatRegNumber),
    encodeTLV(3, invoiceDate),
    encodeTLV(4, totalAmount),
    encodeTLV(5, vatAmount),
  ];
  const combined = Buffer.concat(tlvBuffers);
  return combined.toString("base64");
}

async function generateZatcaQrCode(params: {
  sellerName: string;
  vatRegNumber: string;
  invoiceDate: string;
  totalAmount: string;
  vatAmount: string;
}): Promise<string> {
  const tlvBase64 = generateZatcaTlv(params);
  try {
    const dataUrl = await QRCode.toDataURL(tlvBase64, { width: 160, margin: 1 });
    return dataUrl;
  } catch (e) {
    logger.warn(e, "ZATCA QR code generation failed, falling back to TLV base64");
    return tlvBase64;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UBL 2.1 XML Generator — ZATCA Phase 2 compliant structure
// ─────────────────────────────────────────────────────────────────────────────
function generateZatcaXml(params: {
  invoiceRef: string;
  invoiceUuid: string;
  issueDate: string;
  issueTime: string;
  invoiceTypeCode: string;
  currencyCode: string;
  sellerName: string;
  sellerVat: string;
  sellerStreet: string;
  sellerBuilding: string;
  sellerCity: string;
  sellerPostal: string;
  sellerCountry: string;
  buyerName: string;
  buyerVat?: string;
  lineExtensionAmount: string;
  taxAmount: string;
  taxableAmount: string;
  taxCategoryCode: string;
  taxPercent: string;
  exemptionReason?: string;
  payableAmount: string;
  lines: { description: string; quantity: number; unitPrice: number; lineTotal: number; vatAmount: number }[];
}): string {
  const {
    invoiceRef, invoiceUuid, issueDate, issueTime, invoiceTypeCode,
    currencyCode, sellerName, sellerVat, sellerStreet, sellerBuilding,
    sellerCity, sellerPostal, sellerCountry, buyerName, buyerVat,
    lineExtensionAmount, taxAmount, taxableAmount, taxCategoryCode,
    taxPercent, exemptionReason, payableAmount, lines,
  } = params;

  const exemptionEl = (taxCategoryCode === "E" || taxCategoryCode === "Z") && exemptionReason
    ? `<cbc:TaxExemptionReason>${escapeXml(exemptionReason)}</cbc:TaxExemptionReason>`
    : "";

  const lineItems = lines.map((l, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${l.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currencyCode}">${l.lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${currencyCode}">${l.vatAmount.toFixed(2)}</cbc:TaxAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(l.description || "خدمة")}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${taxCategoryCode}</cbc:ID>
          <cbc:Percent>${taxPercent}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currencyCode}">${l.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoiceRef)}</cbc:ID>
  <cbc:UUID>${invoiceUuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeCode === "383" ? "0200000" : "0100000"}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currencyCode}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currencyCode}</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(sellerName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(sellerStreet)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(sellerBuilding)}</cbc:BuildingNumber>
        <cbc:CityName>${escapeXml(sellerCity)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(sellerPostal)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${sellerCountry}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(sellerVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(buyerName)}</cbc:Name></cac:PartyName>
      ${buyerVat ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(buyerVat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(buyerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currencyCode}">${taxAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currencyCode}">${taxableAmount}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currencyCode}">${taxAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        <cbc:Percent>${taxPercent}</cbc:Percent>
        ${exemptionEl}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currencyCode}">${lineExtensionAmount}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currencyCode}">${lineExtensionAmount}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currencyCode}">${payableAmount}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currencyCode}">${payableAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lineItems}
</Invoice>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function computeInvoiceHash(xmlContent: string): string {
  return crypto.createHash("sha256").update(xmlContent, "utf8").digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// ZATCA Settings CRUD
// ─────────────────────────────────────────────────────────────────────────────

zatcaRouter.get("/zatca/settings", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const [settings] = await rawQuery<ZatcaSettingsRow>(
      `SELECT id, "companyId", enabled, environment, "vatRegistrationNumber", "crNumber",
              "organizationName", "organizationNameEn", "streetName", "buildingNumber",
              "cityName", "postalCode", "countryCode",
              "oauthClientId",
              CASE WHEN "oauthClientSecret" IS NOT NULL THEN '****' ELSE NULL END AS "oauthClientSecret",
              CASE WHEN "csid" IS NOT NULL THEN '****' ELSE NULL END AS csid,
              CASE WHEN "pihKey" IS NOT NULL THEN '****' ELSE NULL END AS "pihKey",
              "lastConnectionTest", "connectionTestStatus", "connectionTestMessage",
              "createdAt", "updatedAt"
       FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );
    res.json({ data: settings || null });
  } catch (err) {
    handleRouteError(err, res, "ZATCA settings GET error:");
  }
});

zatcaRouter.put("/zatca/settings", authorize({ feature: "finance.zatca", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const {
      enabled, environment, vatRegistrationNumber, crNumber,
      organizationName, organizationNameEn, streetName, buildingNumber,
      cityName, postalCode, countryCode, oauthClientId, oauthClientSecret,
      csid, pihKey,
    } = zodParse(zatcaSettingsSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<ZatcaSettingsIdRow>(
      `SELECT id FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );

    if (existing) {
      const sets: string[] = [
        `enabled = $1`, `environment = $2`, `"vatRegistrationNumber" = $3`, `"crNumber" = $4`,
        `"organizationName" = $5`, `"organizationNameEn" = $6`, `"streetName" = $7`,
        `"buildingNumber" = $8`, `"cityName" = $9`, `"postalCode" = $10`, `"countryCode" = $11`,
        `"oauthClientId" = $12`, `"updatedAt" = NOW()`,
      ];
      const params: any[] = [
        enabled ?? false, environment ?? "sandbox", vatRegistrationNumber ?? null,
        crNumber ?? null, organizationName ?? null, organizationNameEn ?? null,
        streetName ?? null, buildingNumber ?? null, cityName ?? null,
        postalCode ?? null, countryCode ?? "SA", oauthClientId ?? null,
      ];
      let nextIdx = 13;
      if (oauthClientSecret != null && oauthClientSecret !== "") {
        sets.splice(-1, 0, `"oauthClientSecret" = $${nextIdx++}`);
        params.push(oauthClientSecret);
      }
      if (csid != null && csid !== "") {
        sets.splice(-1, 0, `"csid" = $${nextIdx++}`);
        params.push(csid);
      }
      if (pihKey != null && pihKey !== "") {
        sets.splice(-1, 0, `"pihKey" = $${nextIdx++}`);
        params.push(pihKey);
      }
      params.push(scope.companyId);
      await rawExecute(
        `UPDATE zatca_settings SET ${sets.join(", ")} WHERE "companyId" = $${nextIdx}`,
        params
      );
    } else {
      await rawExecute(
        `INSERT INTO zatca_settings ("companyId", enabled, environment, "vatRegistrationNumber",
          "crNumber", "organizationName", "organizationNameEn", "streetName", "buildingNumber",
          "cityName", "postalCode", "countryCode", "oauthClientId", "oauthClientSecret", "csid", "pihKey")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [scope.companyId, enabled ?? false, environment ?? "sandbox",
          vatRegistrationNumber ?? null, crNumber ?? null, organizationName ?? null,
          organizationNameEn ?? null, streetName ?? null, buildingNumber ?? null,
          cityName ?? null, postalCode ?? null, countryCode ?? "SA",
          oauthClientId ?? null, oauthClientSecret ?? null, csid ?? null, pihKey ?? null]
      );
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "zatca_settings",
      entityId: scope.companyId,
      after: { enabled, environment, vatRegistrationNumber },
    }).catch((e) => logger.error(e, "finance-zatca background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "zatca.settings.updated", entity: "zatca_settings",
      entityId: scope.companyId, details: JSON.stringify({ enabled, environment }),
    }).catch((e) => logger.error(e, "finance-zatca emitEvent failed"));

    const [updated] = await rawQuery<ZatcaSettingsRow>(
      `SELECT id, "companyId", enabled, environment, "vatRegistrationNumber", "crNumber",
              "organizationName", "organizationNameEn", "streetName", "buildingNumber",
              "cityName", "postalCode", "countryCode", "oauthClientId",
              CASE WHEN "oauthClientSecret" IS NOT NULL THEN '****' ELSE NULL END AS "oauthClientSecret",
              CASE WHEN "csid" IS NOT NULL THEN '****' ELSE NULL END AS csid,
              CASE WHEN "pihKey" IS NOT NULL THEN '****' ELSE NULL END AS "pihKey",
              "lastConnectionTest", "connectionTestStatus", "connectionTestMessage",
              "createdAt", "updatedAt"
       FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );
    res.json({ data: updated, message: "تم حفظ إعدادات ZATCA بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "ZATCA settings PUT error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test connection (simulated)
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.post("/zatca/test-connection", authorize({ feature: "finance.zatca", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;


    const [settings] = await rawQuery<ZatcaSettingsRow>(
      `SELECT * FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );

    if (!settings) {
      throw new ValidationError("لم يتم تهيئة إعدادات ZATCA بعد");
    }

    const isConfigured = !!(settings.vatRegistrationNumber && settings.organizationName);
    const status = isConfigured ? "connected" : "misconfigured";
    const message = isConfigured
      ? `تم الاتصال بنجاح ببيئة ${settings.environment === "production" ? "الإنتاج" : "الاختبار"}`
      : "الإعدادات غير مكتملة — يرجى إدخال رقم التسجيل الضريبي واسم المنشأة";

    await rawExecute(
      `UPDATE zatca_settings SET "lastConnectionTest" = NOW(), "connectionTestStatus" = $1, "connectionTestMessage" = $2 WHERE "companyId" = $3`,
      [status, message, scope.companyId]
    );

    res.json({ status, message, environment: settings.environment, tested: true });
  } catch (err) {
    handleRouteError(err, res, "ZATCA test connection error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Generate XML for an invoice
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.get("/zatca/invoice/:id/xml", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

    const [settings] = await rawQuery<ZatcaSettingsRow>(
      `SELECT * FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );

    const [invoice] = await rawQuery<ZatcaInvoiceRow>(
      `SELECT i.*, c.name AS "clientName", NULL AS "clientVat",
              b.name AS "branchName", b."taxNumber" AS "branchVat"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       LEFT JOIN branches b ON b.id = i."branchId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    if (!invoice) {
      throw new NotFoundError("الفاتورة غير موجودة");
    }

    const lines = await rawQuery<ZatcaInvoiceLineRow>(
      `SELECT * FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id`,
      [id]
    );

    const issueDate = toDateISO(invoice.createdAt || new Date());
    const issueTime = new Date(invoice.createdAt || new Date()).toISOString().split("T")[1].substring(0, 8);

    let uuid = invoice.zatcaUuid;
    if (!uuid) {
      uuid = crypto.randomUUID();
      const { affectedRows } = await rawExecute(`UPDATE invoices SET "zatcaUuid" = $1::uuid WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`, [uuid, id, scope.companyId]);
      if (!affectedRows) throw new NotFoundError("الفاتورة غير موجودة");
    }

    const xml = generateZatcaXml({
      invoiceRef: invoice.ref,
      invoiceUuid: uuid,
      issueDate,
      issueTime,
      invoiceTypeCode: invoice.invoiceTypeCode || "388",
      currencyCode: "SAR",
      sellerName: settings?.organizationName || invoice.branchName || "المنشأة",
      sellerVat: settings?.vatRegistrationNumber || invoice.branchVat || "",
      sellerStreet: settings?.streetName || "",
      sellerBuilding: settings?.buildingNumber || "",
      sellerCity: settings?.cityName || "",
      sellerPostal: settings?.postalCode || "",
      sellerCountry: settings?.countryCode || "SA",
      buyerName: invoice.clientName || "عميل",
      buyerVat: invoice.clientVat || undefined,
      lineExtensionAmount: Number(invoice.subtotal || 0).toFixed(2),
      taxAmount: Number(invoice.vatAmount || 0).toFixed(2),
      taxableAmount: Number(invoice.subtotal || 0).toFixed(2),
      taxCategoryCode: invoice.taxCategoryCode || "S",
      taxPercent: String(invoice.vatRate || 15),
      exemptionReason: invoice.exemptionReason || undefined,
      payableAmount: Number(invoice.total || 0).toFixed(2),
      lines: lines.length > 0 ? lines.map((l) => ({
        description: l.description || "خدمة",
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
        vatAmount: Number(l.vatAmount),
      })) : [{
        description: invoice.description || "خدمة",
        quantity: 1,
        unitPrice: Number(invoice.subtotal || invoice.total || 0),
        lineTotal: Number(invoice.subtotal || invoice.total || 0),
        vatAmount: Number(invoice.vatAmount || 0),
      }],
    });

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    handleRouteError(err, res, "ZATCA XML generation error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Simulate ZATCA submission for invoice
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.post("/zatca/invoice/:id/submit", authorize({ feature: "finance.zatca", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

    const [settings] = await rawQuery<ZatcaSettingsRow>(
      `SELECT * FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );

    if (!settings?.enabled) {
      throw new ValidationError("ربط ZATCA غير مفعّل. فعّله من الإعدادات أولاً");
    }

    const [invoice] = await rawQuery<ZatcaInvoiceRow>(
      `SELECT i.*, c.name AS "clientName", NULL AS "clientVat",
              b.name AS "branchName", b."taxNumber" AS "branchVat"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       LEFT JOIN branches b ON b.id = i."branchId"
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    if (!invoice) {
      throw new NotFoundError("الفاتورة غير موجودة");
    }

    if (!invoice.isTaxLinked) {
      throw new ValidationError("الفاتورة غير مربوطة بالهيئة. فعّل خيار 'ربط مع الهيئة' أولاً");
    }

    const lines = await rawQuery<ZatcaInvoiceLineRow>(
      `SELECT * FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id`,
      [id]
    );

    const issueDate = toDateISO(invoice.createdAt || new Date());
    const issueTime = new Date(invoice.createdAt || new Date()).toISOString().split("T")[1].substring(0, 8);
    const uuid = invoice.zatcaUuid || crypto.randomUUID();

    const xml = generateZatcaXml({
      invoiceRef: invoice.ref,
      invoiceUuid: uuid,
      issueDate,
      issueTime,
      invoiceTypeCode: invoice.invoiceTypeCode || "388",
      currencyCode: "SAR",
      sellerName: settings.organizationName || invoice.branchName || "المنشأة",
      sellerVat: settings.vatRegistrationNumber || invoice.branchVat || "",
      sellerStreet: settings.streetName || "",
      sellerBuilding: settings.buildingNumber || "",
      sellerCity: settings.cityName || "",
      sellerPostal: settings.postalCode || "",
      sellerCountry: settings.countryCode || "SA",
      buyerName: invoice.clientName || "عميل",
      buyerVat: invoice.clientVat || undefined,
      lineExtensionAmount: Number(invoice.subtotal || 0).toFixed(2),
      taxAmount: Number(invoice.vatAmount || 0).toFixed(2),
      taxableAmount: Number(invoice.subtotal || 0).toFixed(2),
      taxCategoryCode: invoice.taxCategoryCode || "S",
      taxPercent: String(invoice.vatRate || 15),
      exemptionReason: invoice.exemptionReason || undefined,
      payableAmount: Number(invoice.total || 0).toFixed(2),
      lines: lines.length > 0 ? lines.map((l) => ({
        description: l.description || "خدمة",
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
        vatAmount: Number(l.vatAmount),
      })) : [{
        description: invoice.description || "خدمة",
        quantity: 1,
        unitPrice: Number(invoice.subtotal || invoice.total || 0),
        lineTotal: Number(invoice.subtotal || invoice.total || 0),
        vatAmount: Number(invoice.vatAmount || 0),
      }],
    });

    const hash = computeInvoiceHash(xml);

    const sellerName = settings.organizationName || invoice.branchName || "المنشأة";
    const sellerVat = settings.vatRegistrationNumber || invoice.branchVat || "";
    const qrCode = await generateZatcaQrCode({
      sellerName,
      vatRegNumber: sellerVat,
      invoiceDate: `${issueDate}T${issueTime}`,
      totalAmount: Number(invoice.total || 0).toFixed(2),
      vatAmount: Number(invoice.vatAmount || 0).toFixed(2),
    });

    const simulatedSuccess = settings.environment === "sandbox";
    const submissionStatus = simulatedSuccess ? "accepted" : "submitted";

    await rawExecute(
      `UPDATE invoices SET "zatcaUuid" = $1::uuid, "zatcaHash" = $2, "zatcaStatus" = $3, "zatcaQrCode" = $4
       WHERE id = $5 AND "companyId" = $6 AND "deletedAt" IS NULL`,
      [uuid, hash, submissionStatus, qrCode, id, scope.companyId]
    );

    const [logRow] = await rawQuery<{ id: number }>(
      `INSERT INTO zatca_submission_log
        ("companyId", "entityType", "entityId", "invoiceRef", "zatcaUuid", "zatcaHash",
         status, environment, "requestPayload", "responsePayload", "submittedAt", "submittedBy")
       VALUES ($1,'invoice',$2,$3,$4::uuid,$5,$6,$7,$8,$9,NOW(),$10)
       RETURNING id`,
      [scope.companyId, id, invoice.ref, uuid, hash,
        submissionStatus, settings.environment,
        xml.substring(0, 5000),
        JSON.stringify({ clearanceStatus: simulatedSuccess ? "CLEARED" : "REPORTED", uuid, hash }),
        scope.activeAssignmentId]
    );

    res.json({
      message: simulatedSuccess ? "تم إرسال الفاتورة بنجاح (محاكاة sandbox)" : "تم تسجيل طلب الإرسال",
      status: submissionStatus,
      uuid,
      hash,
      qrCode,
      logId: logRow.id,
      environment: settings.environment,
    });
  } catch (err) {
    handleRouteError(err, res, "ZATCA invoice submit error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Simulate ZATCA submission for expense
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.post("/zatca/expense/:id/submit", authorize({ feature: "finance.zatca", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

    const [settings] = await rawQuery<ZatcaSettingsRow>(
      `SELECT * FROM zatca_settings WHERE "companyId" = $1`,
      [scope.companyId]
    );

    if (!settings?.enabled) {
      throw new ValidationError("ربط ZATCA غير مفعّل. فعّله من الإعدادات أولاً");
    }

    const [expense] = await rawQuery<ZatcaExpenseRow>(
      `SELECT je.*, COALESCE(SUM(jl.debit), 0) AS amount
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je.id = $1 AND je."companyId" = $2 AND je.type = 'expense' AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [id, scope.companyId]
    );

    if (!expense) {
      throw new NotFoundError("المصروف غير موجود");
    }

    if (!expense.isTaxLinked) {
      throw new ValidationError("المصروف غير مربوط بالهيئة");
    }

    const issueDate = toDateISO(expense.createdAt);
    const uuid = expense.zatcaUuid || crypto.randomUUID();

    const sellerName = settings.organizationName || "المنشأة";
    const sellerVat = settings.vatRegistrationNumber || "";
    const amount = Number(expense.amount || 0);
    const vatAmount = Number(expense.vatAmount || (expense.taxCategory === "VAT" ? amount * 0.15 : 0));

    const qrCode = await generateZatcaQrCode({
      sellerName,
      vatRegNumber: sellerVat,
      invoiceDate: new Date(expense.createdAt).toISOString(),
      totalAmount: (amount + vatAmount).toFixed(2),
      vatAmount: vatAmount.toFixed(2),
    });

    const hash = computeInvoiceHash(`${expense.ref || expense.id}-${issueDate}-${amount}`);
    const simulatedSuccess = settings.environment === "sandbox";
    const submissionStatus = simulatedSuccess ? "accepted" : "submitted";

    await rawExecute(
      `UPDATE journal_entries SET "zatcaUuid" = $1::uuid, "zatcaHash" = $2, "zatcaStatus" = $3, "zatcaQrCode" = $4
       WHERE id = $5 AND "companyId" = $6 AND "deletedAt" IS NULL`,
      [uuid, hash, submissionStatus, qrCode, id, scope.companyId]
    );

    await rawQuery<{ id: number }>(
      `INSERT INTO zatca_submission_log
        ("companyId", "entityType", "entityId", "invoiceRef", "zatcaUuid", "zatcaHash",
         status, environment, "submittedAt", "submittedBy")
       VALUES ($1,'expense',$2,$3,$4::uuid,$5,$6,$7,NOW(),$8)
       RETURNING id`,
      [scope.companyId, id, expense.ref || `EXP-${expense.id}`, uuid, hash,
        submissionStatus, settings.environment, scope.activeAssignmentId]
    );

    res.json({
      message: simulatedSuccess ? "تم إرسال بيانات المصروف بنجاح (محاكاة sandbox)" : "تم تسجيل طلب الإرسال",
      status: submissionStatus, uuid, hash, qrCode,
    });
  } catch (err) {
    handleRouteError(err, res, "ZATCA expense submit error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZATCA submission log list
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.get("/zatca/submissions", authorize({ feature: "finance.zatca", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { page = "1", limit: lim = "20", status = "" } = req.query as Record<string, string | undefined>;
    const safeLim = Math.min(Number(lim) || 50, 500);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLim;

    let whereExtra = "";
    const params: any[] = [scope.companyId];
    if (status) {
      params.push(status);
      whereExtra = ` AND l.status = $${params.length}`;
    }

    params.push(safeLim);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const logs = await rawQuery<ZatcaLogRow>(
      `SELECT l.id, l."entityType", l."entityId", l."invoiceRef",
              l.status, l.environment, l."submittedAt", l."respondedAt",
              l."errorMessage", l."zatcaUuid"
       FROM zatca_submission_log l
       WHERE l."companyId" = $1${whereExtra}
       ORDER BY l."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<CountTotalRow>(
      `SELECT COUNT(*) AS total FROM zatca_submission_log l WHERE l."companyId" = $1${whereExtra}`,
      countParams
    );

    const [stats] = await rawQuery<ZatcaStatsRow>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE status IN ('pending','submitted')) AS pending,
        COUNT(*) AS total
       FROM zatca_submission_log WHERE "companyId" = $1`,
      [scope.companyId]
    );

    res.json({
      data: logs,
      total: Number(countRow?.total ?? 0),
      page: Number(page),
      pageSize: Number(lim),
      stats: {
        accepted: Number(stats?.accepted ?? 0),
        rejected: Number(stats?.rejected ?? 0),
        pending: Number(stats?.pending ?? 0),
        total: Number(stats?.total ?? 0),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "ZATCA submissions list error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Update invoice ZATCA fields (isTaxLinked, invoiceTypeCode, taxCategoryCode, exemptionReason)
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.patch("/zatca/invoice/:id", authorize({ feature: "finance.zatca", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(zatcaInvoicePatchSchema.safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (b.isTaxLinked !== undefined) { sets.push(`"isTaxLinked" = $${idx++}`); params.push(b.isTaxLinked); }
    if (b.invoiceTypeCode !== undefined) { sets.push(`"invoiceTypeCode" = $${idx++}`); params.push(b.invoiceTypeCode); }
    if (b.taxCategoryCode !== undefined) { sets.push(`"taxCategoryCode" = $${idx++}`); params.push(b.taxCategoryCode); }
    if (b.exemptionReason !== undefined) { sets.push(`"exemptionReason" = $${idx++}`); params.push(b.exemptionReason); }
    if (sets.length === 0) { throw new ValidationError("لا توجد بيانات للتحديث"); return; }

    params.push(id, scope.companyId);
    const [row] = await rawQuery<{ id: number; isTaxLinked: boolean; invoiceTypeCode: string | null; taxCategoryCode: string | null; exemptionReason: string | null; zatcaStatus: string | null }>(
      `UPDATE invoices SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING id, "isTaxLinked", "invoiceTypeCode", "taxCategoryCode", "exemptionReason", "zatcaStatus"`,
      params
    );
    if (!row) { throw new NotFoundError("الفاتورة غير موجودة"); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "ZATCA invoice patch error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Update expense ZATCA fields
// ─────────────────────────────────────────────────────────────────────────────
zatcaRouter.patch("/zatca/expense/:id", authorize({ feature: "finance.zatca", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(zatcaExpensePatchSchema.safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (b.isTaxLinked !== undefined) { sets.push(`"isTaxLinked" = $${idx++}`); params.push(b.isTaxLinked); }
    if (b.invoiceTypeCode !== undefined) { sets.push(`"invoiceTypeCode" = $${idx++}`); params.push(b.invoiceTypeCode); }
    if (b.taxCategoryCode !== undefined) { sets.push(`"taxCategoryCode" = $${idx++}`); params.push(b.taxCategoryCode); }
    if (b.exemptionReason !== undefined) { sets.push(`"exemptionReason" = $${idx++}`); params.push(b.exemptionReason); }
    if (sets.length === 0) { throw new ValidationError("لا توجد بيانات للتحديث"); return; }

    params.push(id, scope.companyId);
    const [row] = await rawQuery<{ id: number; isTaxLinked: boolean; invoiceTypeCode: string | null; taxCategoryCode: string | null; exemptionReason: string | null; zatcaStatus: string | null }>(
      `UPDATE journal_entries SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND type = 'expense' AND "deletedAt" IS NULL RETURNING id, "isTaxLinked", "invoiceTypeCode", "taxCategoryCode", "exemptionReason", "zatcaStatus"`,
      params
    );
    if (!row) { throw new NotFoundError("المصروف غير موجود"); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "ZATCA expense patch error:");
  }
});
