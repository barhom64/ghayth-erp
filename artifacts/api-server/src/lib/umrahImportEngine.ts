import * as XLSX from "xlsx";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent, createAuditLog } from "./businessHelpers.js";
import { ValidationError } from "./errorHandler.js";
import type pg from "pg";

// ---------------------------------------------------------------------------
// Arabic header → DB column mapping
// ---------------------------------------------------------------------------

const MUTAMER_HEADER_MAP: Record<string, string> = {
  "رقم المعتمر في النظام": "nuskNumber",
  "رقم المعتمر": "nuskNumber",
  "رقم نسك": "nuskNumber",
  "اسم المعتمر": "fullName",
  "الاسم": "fullName",
  "الجنسية": "nationality",
  "الجنس": "gender",
  "رقم الجواز": "passportNumber",
  "صلاحية الجواز": "passportExpiry",
  "رقم التأشيرة": "visaNumber",
  "رقم المجموعة": "nuskGroupNumber",
  "اسم المجموعة": "groupName",
  "رقم الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "رمز المكتب": "nuskCode",
  "اسم المكتب": "subAgentName",
  "الحالة": "status",
  "تاريخ الدخول": "entryDate",
  "تاريخ الخروج": "exitDate",
  "ميناء الدخول": "entryPort",
  "رحلة الدخول": "entryFlight",
  "ميناء الخروج": "exitPort",
  "رحلة الخروج": "exitFlight",
  "رقم الحدود": "borderNumber",
  "رقم الموفا": "mofaNumber",
  "مدة البرنامج": "programDuration",
  "أيام الإقامة الفعلية": "actualStayDays",
  "أيام التجاوز": "overstayDays",
  "داخل المملكة": "isInsideKingdom",
  "لديه تصريح عمرة": "hasUmrahPermit",
  "الدولة": "country",
};

const VOUCHER_HEADER_MAP: Record<string, string> = {
  "رقم الفاتورة": "nuskInvoiceNumber",
  "رقم فاتورة نسك": "nuskInvoiceNumber",
  "رقم المجموعة": "nuskGroupNumber",
  "اسم المجموعة": "groupName",
  "عدد المعتمرين": "mutamerCount",
  "خدمات أرضية": "groundServices",
  "رسوم إلكترونية": "electronicFees",
  "رسوم التأشيرة": "visaFees",
  "رسوم التأمين": "insuranceFees",
  "خدمات الإثراء": "enrichmentServices",
  "خدمات إضافية": "additionalServices",
  "إجمالي النقل": "transportTotal",
  "إجمالي الفنادق": "hotelTotal",
  "المبالغ المستردة": "refundAmount",
  "صافي التكلفة": "netCost",
  "الإجمالي": "totalAmount",
  "المبلغ الإجمالي": "totalAmount",
  "الحالة": "nuskStatus",
  "حالة الفاتورة": "nuskStatus",
  "تاريخ الإصدار": "issueDate",
  "تاريخ الانتهاء": "expiryDate",
  "مدة البرنامج": "programDuration",
  "رقم الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "رمز المكتب": "nuskCode",
  "اسم المكتب": "subAgentName",
};

const STATUS_MAP: Record<string, string> = {
  "داخل المملكة": "inside_kingdom",
  "خرج": "exited",
  "متجاوز": "overstay",
  "تم التبليغ": "absconded",
  "هارب": "absconded",
  "متوفي": "deceased",
  "متوفى": "deceased",
  "مرفوض": "visa_rejected",
  "تأشيرة مطبوعة": "visa_printed",
  "معلق": "pending",
  "نشط": "active",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
};

const NUSK_STATUS_MAP: Record<string, string> = {
  "مدفوع": "paid",
  "مدفوعة": "paid",
  "معلق": "pending",
  "معلقة": "pending",
  "منتهي": "expired",
  "منتهية": "expired",
  "قيد التنفيذ": "in_progress",
  "مسترد": "refunded",
  "مستردة": "refunded",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
  "ملغية": "cancelled",
};

const BOOL_TRUE = new Set(["نعم", "yes", "true", "1", "صحيح"]);

// ---------------------------------------------------------------------------
// Text normalization (ي/ى, whitespace, NFC)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/ى/g, "ي")
    .replace(/ة$/g, "ه")
    .trim();
}

function normalizeHeader(h: string): string {
  return normalize(h).replace(/["']/g, "");
}

// ---------------------------------------------------------------------------
// Parse workbook → typed rows
// ---------------------------------------------------------------------------

export interface ParsedRow {
  [key: string]: string | number | boolean | null;
}

export function parseMutamersWorkbook(buffer: Buffer): ParsedRow[] {
  return parseWorkbook(buffer, MUTAMER_HEADER_MAP, "mutamers");
}

export function parseVouchersWorkbook(buffer: Buffer): ParsedRow[] {
  return parseWorkbook(buffer, VOUCHER_HEADER_MAP, "vouchers");
}

// ---------------------------------------------------------------------------
// Normalize already-parsed rows (Arabic header keys → DB field names).
// The frontend import-wizard parses the xlsx client-side and sends rows as
// { "رقم المعتمر في النظام": "...", ... }. These helpers map those Arabic
// keys to the DB column names the import engine expects, and coerce values
// exactly the same way parseWorkbook does.
// ---------------------------------------------------------------------------

export function normalizeMutamerRows(rawRows: Record<string, any>[]): ParsedRow[] {
  return normaliseRows(rawRows, MUTAMER_HEADER_MAP);
}

export function normalizeVoucherRows(rawRows: Record<string, any>[]): ParsedRow[] {
  return normaliseRows(rawRows, VOUCHER_HEADER_MAP);
}

function normaliseRows(rawRows: Record<string, any>[], headerMap: Record<string, string>): ParsedRow[] {
  // Build a reverse lookup keyed by the NORMALISED Arabic header so the
  // mapping is resilient to ي/ى differences and stray whitespace.
  const normalisedMap = new Map<string, string>();
  for (const [arabic, field] of Object.entries(headerMap)) {
    normalisedMap.set(normalizeHeader(arabic), field);
  }

  const out: ParsedRow[] = [];
  for (const raw of rawRows) {
    if (!raw || Object.keys(raw).length === 0) continue;

    const row: ParsedRow = {};
    for (const [key, rawVal] of Object.entries(raw)) {
      const field = normalisedMap.get(normalizeHeader(String(key)));
      if (!field) continue;

      let val: any = rawVal instanceof Date ? rawVal.toISOString().split("T")[0] : String(rawVal ?? "").trim();
      row[field] = coerceValue(field, val);
    }

    // Skip rows where no recognisable keys were present.
    if (Object.keys(row).length === 0) continue;
    out.push(row);
  }

  return out;
}

// Spec: overstay_days = actual_stay_days - program_duration when positive.
// Fall back to the explicit "أيام التجاوز" column if provided.
function computeOverstayDays(row: ParsedRow): number {
  const actual = Number(row.actualStayDays);
  const program = Number(row.programDuration);
  if (Number.isFinite(actual) && Number.isFinite(program) && actual > program) {
    return actual - program;
  }
  const explicit = Number(row.overstayDays);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 0;
}

function coerceValue(field: string, val: string): any {
  if (field === "status") return STATUS_MAP[val] ?? val;
  if (field === "nuskStatus") return NUSK_STATUS_MAP[val] ?? val;
  if (field === "gender") {
    if (val === "ذكر" || val === "male") return "male";
    if (val === "أنثى" || val === "female") return "female";
    return val || null;
  }
  if (field === "isInsideKingdom" || field === "hasUmrahPermit") return BOOL_TRUE.has(String(val).toLowerCase());
  if (["programDuration", "actualStayDays", "overstayDays", "mutamerCount"].includes(field)) {
    return val ? Number(val) || 0 : null;
  }
  if ([
    "groundServices", "electronicFees", "visaFees", "insuranceFees",
    "enrichmentServices", "additionalServices", "transportTotal",
    "hotelTotal", "refundAmount", "netCost", "totalAmount",
  ].includes(field)) {
    return val ? Number(val) || 0 : 0;
  }
  return val || null;
}

function parseWorkbook(buffer: Buffer, headerMap: Record<string, string>, fileType: string): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ValidationError("الملف لا يحتوي على أي ورقة");
  const sheet = wb.Sheets[sheetName]!;
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length < 2) throw new ValidationError("الملف لا يحتوي على بيانات");

  const headerRow = raw[0]!;
  const colMap: { idx: number; field: string }[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(String(headerRow[i] ?? ""));
    for (const [arabic, field] of Object.entries(headerMap)) {
      if (h === normalizeHeader(arabic)) {
        colMap.push({ idx: i, field });
        break;
      }
    }
  }

  if (colMap.length === 0) throw new ValidationError("لم يتم التعرف على أي أعمدة في الملف");

  const rows: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const dataRow = raw[r]!;
    if (!dataRow || dataRow.every((c: any) => c === "" || c == null)) continue;

    const row: ParsedRow = {};
    for (const { idx, field } of colMap) {
      let val: any = dataRow[idx];
      if (val instanceof Date) {
        val = val.toISOString().split("T")[0];
      } else {
        val = String(val ?? "").trim();
      }

      if (field === "status") {
        row[field] = STATUS_MAP[val] ?? val;
      } else if (field === "nuskStatus") {
        row[field] = NUSK_STATUS_MAP[val] ?? val;
      } else if (field === "gender") {
        row[field] = val === "ذكر" || val === "male" ? "male" : val === "أنثى" || val === "female" ? "female" : val;
      } else if (field === "isInsideKingdom" || field === "hasUmrahPermit") {
        row[field] = BOOL_TRUE.has(String(val).toLowerCase());
      } else if (["programDuration", "actualStayDays", "overstayDays", "mutamerCount"].includes(field)) {
        row[field] = val ? Number(val) || 0 : null;
      } else if ([
        "groundServices", "electronicFees", "visaFees", "insuranceFees",
        "enrichmentServices", "additionalServices", "transportTotal",
        "hotelTotal", "refundAmount", "netCost", "totalAmount",
      ].includes(field)) {
        row[field] = val ? Number(val) || 0 : 0;
      } else {
        row[field] = val || null;
      }
    }
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Import scope
// ---------------------------------------------------------------------------

export interface ImportScope {
  companyId: number;
  branchId: number;
  userId: number;
  seasonId: number;
}

// ---------------------------------------------------------------------------
// Preview (dry run) — returns diff without writing
// ---------------------------------------------------------------------------

export interface ImportDiff {
  newRows: ParsedRow[];
  updatedRows: { row: ParsedRow; changes: { field: string; oldValue: any; newValue: any }[] }[];
  skippedCount: number;
  errorRows: { rowIndex: number; error: string }[];
  unlinkedSubAgents: { nuskCode: string; name: string; rowCount: number }[];
  totalRows: number;
  financialImpactCount: number;
}

export async function previewMutamersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "mutamers");
}

export async function previewVouchersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "vouchers");
}

async function previewImport(scope: ImportScope, rows: ParsedRow[], fileType: "mutamers" | "vouchers"): Promise<ImportDiff> {
  const diff: ImportDiff = {
    newRows: [],
    updatedRows: [],
    skippedCount: 0,
    errorRows: [],
    unlinkedSubAgents: [],
    totalRows: rows.length,
    financialImpactCount: 0,
  };

  if (fileType === "mutamers") {
    const nuskNumbers = rows.map((r) => r.nuskNumber).filter(Boolean) as string[];
    if (nuskNumbers.length === 0) return diff;

    const existing = await rawQuery<any>(
      `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber",
              "entryPort", "exitPort", "overstayDays", "actualStayDays"
       FROM umrah_pilgrims
       WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
      [scope.companyId, nuskNumbers]
    );
    const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

    const subAgentCodes = new Set<string>();
    rows.forEach((r) => { if (r.nuskCode) subAgentCodes.add(String(r.nuskCode)); });
    const linkedSubs = subAgentCodes.size > 0
      ? await rawQuery<any>(
          `SELECT "nuskCode" FROM umrah_sub_agents WHERE "companyId" = $1 AND "nuskCode" = ANY($2) AND "clientId" IS NOT NULL AND "deletedAt" IS NULL`,
          [scope.companyId, [...subAgentCodes]]
        )
      : [];
    const linkedSet = new Set(linkedSubs.map((s: any) => s.nuskCode));

    const unlinkedMap = new Map<string, { name: string; count: number }>();

    const COMPARE_FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays"];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.nuskNumber) {
        diff.errorRows.push({ rowIndex: i, error: "رقم المعتمر مفقود" });
        continue;
      }
      const ex = existMap.get(String(row.nuskNumber));
      if (!ex) {
        diff.newRows.push(row);
      } else {
        const changes: { field: string; oldValue: any; newValue: any }[] = [];
        for (const f of COMPARE_FIELDS) {
          const oldVal = ex[f] ?? null;
          const newVal = row[f] ?? null;
          if (String(oldVal) !== String(newVal) && newVal !== null) {
            changes.push({ field: f, oldValue: oldVal, newValue: newVal });
            if (f === "overstayDays" || f === "actualStayDays") diff.financialImpactCount++;
          }
        }
        if (changes.length > 0) {
          diff.updatedRows.push({ row, changes });
        } else {
          diff.skippedCount++;
        }
      }

      if (row.nuskCode && !linkedSet.has(String(row.nuskCode))) {
        const code = String(row.nuskCode);
        const entry = unlinkedMap.get(code);
        if (entry) entry.count++;
        else unlinkedMap.set(code, { name: String(row.subAgentName ?? row.nuskCode), count: 1 });
      }
    }

    diff.unlinkedSubAgents = [...unlinkedMap.entries()].map(([nuskCode, { name, count }]) => ({
      nuskCode, name, rowCount: count,
    }));
  } else {
    const invoiceNumbers = rows.map((r) => r.nuskInvoiceNumber).filter(Boolean) as string[];
    if (invoiceNumbers.length === 0) return diff;

    const existing = await rawQuery<any>(
      `SELECT id, "nuskInvoiceNumber", "totalAmount", "netCost", "nuskStatus"
       FROM umrah_nusk_invoices
       WHERE "companyId" = $1 AND "nuskInvoiceNumber" = ANY($2) AND "deletedAt" IS NULL`,
      [scope.companyId, invoiceNumbers]
    );
    const existMap = new Map(existing.map((e: any) => [e.nuskInvoiceNumber, e]));

    const COMPARE_FIELDS = ["totalAmount", "netCost", "nuskStatus", "mutamerCount"];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.nuskInvoiceNumber) {
        diff.errorRows.push({ rowIndex: i, error: "رقم الفاتورة مفقود" });
        continue;
      }
      const ex = existMap.get(String(row.nuskInvoiceNumber));
      if (!ex) {
        diff.newRows.push(row);
      } else {
        const changes: { field: string; oldValue: any; newValue: any }[] = [];
        for (const f of COMPARE_FIELDS) {
          const oldVal = ex[f] ?? null;
          const newVal = row[f] ?? null;
          if (String(oldVal) !== String(newVal) && newVal !== null) {
            changes.push({ field: f, oldValue: oldVal, newValue: newVal });
            if (f === "totalAmount" || f === "netCost") diff.financialImpactCount++;
          }
        }
        if (changes.length > 0) diff.updatedRows.push({ row, changes });
        else diff.skippedCount++;
      }
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Confirm import — UPSERT with batch tracking
// ---------------------------------------------------------------------------

export interface ImportResult {
  batchId: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  financialImpactCount: number;
}

export async function confirmMutamersImport(
  scope: ImportScope,
  rows: ParsedRow[],
  fileName: string,
): Promise<ImportResult> {
  return withTransaction(async (client) => {
    const batchRes = await client.query(
      `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","uploadedBy","totalRows",status)
       VALUES ($1,$2,$3,'mutamers',$4,$5,$6,'confirmed') RETURNING id`,
      [scope.companyId, scope.branchId, scope.seasonId, fileName, scope.userId, rows.length]
    );
    const batchId = batchRes.rows[0].id;

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0, financialImpactCount = 0;
    const BATCH_SIZE = 200;

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const nuskNumbers = batch.map((r) => r.nuskNumber).filter(Boolean) as string[];

      const existing = nuskNumbers.length > 0
        ? (await client.query(
            `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber",
                    "entryPort", "exitPort", "overstayDays", "actualStayDays"
             FROM umrah_pilgrims
             WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
            [scope.companyId, nuskNumbers]
          )).rows
        : [];
      const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

      for (const row of batch) {
        if (!row.nuskNumber) { errorCount++; continue; }
        try {
          const groupId = await resolveGroup(client, scope, row);
          const agentId = await resolveAgent(client, scope, row);
          const subAgentId = await resolveSubAgent(client, scope, row, agentId);

          const ex = existMap.get(String(row.nuskNumber));
          if (!ex) {
            const res = await client.query(
              `INSERT INTO umrah_pilgrims
               ("companyId","branchId","seasonId","nuskNumber","fullName",nationality,gender,
                "passportNumber","passportExpiry","visaNumber","groupId","subAgentId","agentId",
                status,"entryPort","entryFlight","exitPort","exitFlight",
                "actualStayDays","programDuration","overstayDays","borderNumber","mofaNumber",
                "isInsideKingdom","hasUmrahPermit","createdBy","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW(),NOW())
               RETURNING id`,
              [
                scope.companyId, scope.branchId, scope.seasonId,
                row.nuskNumber, row.fullName, row.nationality, row.gender,
                row.passportNumber, row.passportExpiry || null, row.visaNumber || null,
                groupId, subAgentId, agentId,
                row.status || "pending",
                row.entryPort || null, row.entryFlight || null,
                row.exitPort || null, row.exitFlight || null,
                row.actualStayDays ?? null, row.programDuration ?? 14,
                computeOverstayDays(row),
                row.borderNumber || null, row.mofaNumber || null,
                row.isInsideKingdom ?? false, row.hasUmrahPermit ?? false,
                scope.userId,
              ]
            );
            await logChange(client, batchId, "mutamer", res.rows[0].id, "created");
            newCount++;

            if (row.status === "overstay" || row.status === "absconded") {
              await detectViolation(client, scope, row, res.rows[0].id, groupId, subAgentId, agentId);
            }
          } else {
            const FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays"];
            const changes: string[] = [];
            const vals: any[] = [];
            let hasFinancial = false;

            for (const f of FIELDS) {
              const oldVal = ex[f] ?? null;
              const newVal = row[f] ?? null;
              if (String(oldVal) !== String(newVal) && newVal !== null) {
                vals.push(newVal);
                changes.push(`"${f}"=$${vals.length}`);
                await logChange(client, batchId, "mutamer", ex.id, "updated", f, oldVal, newVal,
                  f === "overstayDays" || f === "actualStayDays");
                if (f === "overstayDays" || f === "actualStayDays") hasFinancial = true;
              }
            }

            if (groupId) { vals.push(groupId); changes.push(`"groupId"=$${vals.length}`); }
            if (subAgentId) { vals.push(subAgentId); changes.push(`"subAgentId"=$${vals.length}`); }
            if (agentId) { vals.push(agentId); changes.push(`"agentId"=$${vals.length}`); }

            if (changes.length > 0) {
              vals.push(scope.userId);
              changes.push(`"updatedBy"=$${vals.length}`);
              changes.push(`"updatedAt"=NOW()`);
              vals.push(ex.id);
              await client.query(
                `UPDATE umrah_pilgrims SET ${changes.join(",")} WHERE id=$${vals.length}`,
                vals
              );
              updatedCount++;
              if (hasFinancial) financialImpactCount++;

              if ((row.status === "overstay" || row.status === "absconded") && ex.status !== row.status) {
                await detectViolation(client, scope, row, ex.id, groupId, subAgentId, agentId);
              }
            } else {
              await logChange(client, batchId, "mutamer", ex.id, "skipped");
              skippedCount++;
            }
          }
        } catch (err: any) {
          errorCount++;
          await logChange(client, batchId, "mutamer", 0, "error", null, null, err?.message);
        }
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.mutamers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch(() => {});

    return { batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount };
  });
}

export async function confirmVouchersImport(
  scope: ImportScope,
  rows: ParsedRow[],
  fileName: string,
): Promise<ImportResult> {
  return withTransaction(async (client) => {
    const batchRes = await client.query(
      `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","uploadedBy","totalRows",status)
       VALUES ($1,$2,$3,'vouchers',$4,$5,$6,'confirmed') RETURNING id`,
      [scope.companyId, scope.branchId, scope.seasonId, fileName, scope.userId, rows.length]
    );
    const batchId = batchRes.rows[0].id;

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0, financialImpactCount = 0;

    for (const row of rows) {
      if (!row.nuskInvoiceNumber) { errorCount++; continue; }
      try {
        const groupId = await resolveGroup(client, scope, row);
        const agentId = await resolveAgent(client, scope, row);
        const subAgentId = await resolveSubAgent(client, scope, row, agentId);

        const [ex] = (await client.query(
          `SELECT * FROM umrah_nusk_invoices WHERE "companyId"=$1 AND "nuskInvoiceNumber"=$2 AND "deletedAt" IS NULL`,
          [scope.companyId, row.nuskInvoiceNumber]
        )).rows;

        if (!ex) {
          const res = await client.query(
            `INSERT INTO umrah_nusk_invoices
             ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId",
              "mutamerCount","groundServices","electronicFees","visaFees","insuranceFees",
              "enrichmentServices","additionalServices","transportTotal","hotelTotal",
              "refundAmount","netCost","totalAmount","nuskStatus","issueDate","expiryDate",
              "programDuration","createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())
             RETURNING id`,
            [
              scope.companyId, scope.branchId, row.nuskInvoiceNumber,
              agentId, subAgentId, groupId,
              row.mutamerCount ?? 0,
              row.groundServices ?? 0, row.electronicFees ?? 0, row.visaFees ?? 0,
              row.insuranceFees ?? 0, row.enrichmentServices ?? 0, row.additionalServices ?? 0,
              row.transportTotal ?? 0, row.hotelTotal ?? 0, row.refundAmount ?? 0,
              // Spec: net_cost = total_amount - refund_amount. Prefer that
              // over any server-supplied net_cost so the stored row is always
              // internally consistent.
              Math.max(0, (Number(row.totalAmount) || 0) - (Number(row.refundAmount) || 0)),
              row.totalAmount ?? 0,
              row.nuskStatus || "pending",
              row.issueDate || null, row.expiryDate || null,
              row.programDuration ?? null, scope.userId,
            ]
          );
          await logChange(client, batchId, "nusk_invoice", res.rows[0].id, "created");
          newCount++;
        } else {
          const FIELDS = ["totalAmount", "netCost", "nuskStatus", "mutamerCount"];
          const changes: string[] = [];
          const vals: any[] = [];
          let hasFinancial = false;

          for (const f of FIELDS) {
            const oldVal = ex[f] ?? null;
            const newVal = row[f] ?? null;
            if (String(oldVal) !== String(newVal) && newVal !== null) {
              vals.push(newVal);
              changes.push(`"${f}"=$${vals.length}`);
              await logChange(client, batchId, "nusk_invoice", ex.id, "updated", f, oldVal, newVal,
                f === "totalAmount" || f === "netCost");
              if (f === "totalAmount" || f === "netCost") hasFinancial = true;
            }
          }

          if (groupId && ex.groupId !== groupId) { vals.push(groupId); changes.push(`"groupId"=$${vals.length}`); }
          if (subAgentId && ex.subAgentId !== subAgentId) { vals.push(subAgentId); changes.push(`"subAgentId"=$${vals.length}`); }

          if (changes.length > 0) {
            vals.push(scope.userId);
            changes.push(`"updatedBy"=$${vals.length}`);
            changes.push(`"updatedAt"=NOW()`);
            vals.push(ex.id);
            await client.query(
              `UPDATE umrah_nusk_invoices SET ${changes.join(",")} WHERE id=$${vals.length}`,
              vals
            );
            updatedCount++;
            if (hasFinancial) financialImpactCount++;
          } else {
            skippedCount++;
          }
        }
      } catch (err: any) {
        errorCount++;
        await logChange(client, batchId, "nusk_invoice", 0, "error", null, null, err?.message);
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.vouchers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch(() => {});

    return { batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount };
  });
}

// ---------------------------------------------------------------------------
// Helpers: auto-resolve agent / sub-agent / group
// ---------------------------------------------------------------------------

async function resolveAgent(client: pg.PoolClient, scope: ImportScope, row: ParsedRow): Promise<number | null> {
  if (!row.nuskAgentNumber && !row.agentName) return null;
  if (row.nuskAgentNumber) {
    const [ex] = (await client.query(
      `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND "nuskAgentNumber"=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, row.nuskAgentNumber]
    )).rows;
    if (ex) return ex.id;
  }
  const res = await client.query(
    `INSERT INTO umrah_agents ("companyId","branchId",name,"nuskAgentNumber","seasonId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
     ON CONFLICT ("companyId","nuskAgentNumber") WHERE "deletedAt" IS NULL DO UPDATE SET "updatedAt"=NOW()
     RETURNING id`,
    [scope.companyId, scope.branchId, row.agentName || `وكيل ${row.nuskAgentNumber}`, row.nuskAgentNumber, scope.seasonId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveSubAgent(client: pg.PoolClient, scope: ImportScope, row: ParsedRow, agentId: number | null): Promise<number | null> {
  if (!row.nuskCode) return null;
  const [ex] = (await client.query(
    `SELECT id FROM umrah_sub_agents WHERE "companyId"=$1 AND "nuskCode"=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, row.nuskCode]
  )).rows;
  if (ex) return ex.id;
  const res = await client.query(
    `INSERT INTO umrah_sub_agents ("companyId","branchId","nuskCode",name,"agentId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskCode, row.subAgentName || `فرعي ${row.nuskCode}`, agentId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveGroup(client: pg.PoolClient, scope: ImportScope, row: ParsedRow): Promise<number | null> {
  if (!row.nuskGroupNumber) return null;
  const [ex] = (await client.query(
    `SELECT id FROM umrah_groups WHERE "companyId"=$1 AND "nuskGroupNumber"=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, row.nuskGroupNumber]
  )).rows;
  if (ex) return ex.id;
  const res = await client.query(
    `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber",name,"seasonId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskGroupNumber, row.groupName || `مجموعة ${row.nuskGroupNumber}`, scope.seasonId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

async function detectViolation(
  client: pg.PoolClient, scope: ImportScope, row: ParsedRow,
  mutamerId: number, groupId: number | null, subAgentId: number | null, agentId: number | null,
) {
  const type = row.status === "absconded" ? "absconded" : "overstay";
  const [exists] = (await client.query(
    `SELECT id FROM umrah_violations
     WHERE "companyId"=$1 AND "mutamerId"=$2 AND type=$3 AND "deletedAt" IS NULL`,
    [scope.companyId, mutamerId, type]
  )).rows;
  if (exists) return;

  const penalty = type === "absconded" ? 2000 : (Number(row.overstayDays) || 0) * 0;

  await client.query(
    `INSERT INTO umrah_violations
     ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","groupId","subAgentId","agentId",
      description,"penaltyAmount",status,"createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,'mutamer',$4,$5,$6,$7,$8,$9,$10,'detected',$11,NOW(),NOW())`,
    [
      scope.companyId, scope.branchId, type,
      String(row.nuskNumber), mutamerId, groupId, subAgentId, agentId,
      type === "absconded" ? `هروب معتمر: ${row.fullName}` : `تجاوز مدة: ${row.fullName} (${row.overstayDays} يوم)`,
      penalty, scope.userId,
    ]
  );

  const eventName = type === "absconded" ? "umrah.absconder.detected" : "umrah.overstay.detected";
  emitEvent({
    companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
    action: eventName, entity: "umrah_violations", entityId: mutamerId,
    after: { nuskNumber: row.nuskNumber, type, overstayDays: row.overstayDays },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Change log helper
// ---------------------------------------------------------------------------

async function logChange(
  client: pg.PoolClient, batchId: number, entityType: string, entityId: number,
  changeType: string, fieldName?: string | null, oldValue?: any, newValue?: any, hasFinancialImpact?: boolean,
) {
  await client.query(
    `INSERT INTO umrah_import_changes
     ("batchId","entityType","entityId","changeType","fieldName","oldValue","newValue","hasFinancialImpact","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [batchId, entityType, entityId, changeType, fieldName ?? null,
     oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null,
     hasFinancialImpact ?? false]
  );
}
