import * as XLSX from "xlsx";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent, createAuditLog, createGuardedJournalEntry, getAccountCodeFromMapping, toDateISO } from "./businessHelpers.js";
import { ValidationError } from "./errorHandler.js";
import type pg from "pg";
import { logger } from "./logger.js";
import { encryptField, blindIndex } from "./fieldEncryption.js";

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
  "داخل المملكة": "arrived",
  "خرج": "departed",
  "متجاوز": "overstayed",
  "تم التبليغ": "violated",
  "هارب": "violated",
  "متوفي": "departed",
  "متوفى": "departed",
  "مرفوض": "cancelled",
  "تأشيرة مطبوعة": "active",
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
        val = toDateISO(val);
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
  /**
   * Optional treasury (cash-box) the NUSK AP journal entry will reference
   * via the `treasuryId` column on the JE row. Used by the import wizard
   * dropdown so the operator can pick which cash box this batch ties to
   * — otherwise the JE is unlinked and downstream payment routing has to
   * guess.
   */
  treasuryId?: number | null;
  /**
   * Optional override for the umrah-nusk-cost (DR) account code. When
   * unset the engine falls back to the `account_mappings` row for
   * `umrah_nusk_cost`/debit, then to the hard default `5201`. Lets the
   * operator route a specific batch to a different cost account (e.g.
   * to separate Umrah hotels vs. transport accounting).
   */
  purchaseAccountCode?: string | null;
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
  /**
   * Primary agents that will be **auto-created** on confirm because the
   * file references an agent (by nuskAgentNumber or name) that doesn't
   * exist in `umrah_agents`. We surface this before the user confirms so
   * they can review or rename rather than silently growing the directory.
   */
  newAgentsToCreate: { nuskAgentNumber: string | null; agentName: string; rowCount: number }[];
  /**
   * Rows that name no agent at all (neither nuskAgentNumber nor
   * agentName populated). On confirm these save with `agentId = NULL`,
   * meaning they won't appear on any agent statement. The wizard shows
   * a banner so the operator notices.
   */
  rowsWithoutAgent: number;
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
    newAgentsToCreate: [],
    rowsWithoutAgent: 0,
    totalRows: rows.length,
    financialImpactCount: 0,
  };

  if (fileType === "mutamers") {
    const nuskNumbers = rows.map((r) => r.nuskNumber).filter(Boolean) as string[];
    if (nuskNumbers.length === 0) return diff;

    const existing = await rawQuery<Record<string, unknown>>(
      `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber",
              "entryPort", "exitPort", "overstayDays", "actualStayDays",
              "entryDate", "exitDate"
       FROM umrah_pilgrims
       WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
      [scope.companyId, nuskNumbers]
    );
    const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

    const subAgentCodes = new Set<string>();
    rows.forEach((r) => { if (r.nuskCode) subAgentCodes.add(String(r.nuskCode)); });
    const linkedSubs = subAgentCodes.size > 0
      ? await rawQuery<Record<string, unknown>>(
          `SELECT "nuskCode" FROM umrah_sub_agents WHERE "companyId" = $1 AND "nuskCode" = ANY($2) AND "clientId" IS NOT NULL AND "deletedAt" IS NULL`,
          [scope.companyId, [...subAgentCodes]]
        )
      : [];
    const linkedSet = new Set(linkedSubs.map((s: any) => s.nuskCode));

    // Mirror resolveAgent's matching logic so the preview can flag rows
    // that will trigger auto-creation. Match either by NUSK agent number
    // (umrah_agents.contractRef) or by name. The set is keyed by the
    // string we'd look up, so the preview and the confirm phase agree.
    const agentNuskNumbers = new Set<string>();
    const agentNames = new Set<string>();
    for (const r of rows) {
      if (r.nuskAgentNumber) agentNuskNumbers.add(String(r.nuskAgentNumber));
      if (r.agentName) agentNames.add(String(r.agentName));
    }
    const knownByNuskNumber = new Set<string>();
    const knownByName = new Set<string>();
    if (agentNuskNumbers.size > 0) {
      const found = await rawQuery<Record<string, unknown>>(
        `SELECT "contractRef" FROM umrah_agents WHERE "companyId" = $1 AND "contractRef" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNuskNumbers]]
      );
      for (const r of found) knownByNuskNumber.add(String(r.contractRef));
    }
    if (agentNames.size > 0) {
      const found = await rawQuery<Record<string, unknown>>(
        `SELECT name FROM umrah_agents WHERE "companyId" = $1 AND name = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNames]]
      );
      for (const r of found) knownByName.add(String(r.name));
    }

    const unlinkedMap = new Map<string, { name: string; count: number }>();
    const newAgentsMap = new Map<string, { nuskAgentNumber: string | null; agentName: string; count: number }>();

    const COMPARE_FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays", "entryDate", "exitDate"];

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

      // Agent tracking — mirrors resolveAgent's match priority. Any row
      // that names an agent (number or name) which DOESN'T match an
      // existing umrah_agents row will trigger auto-creation on confirm.
      // Rows with no agent info at all save with agentId=null and won't
      // appear on any agent statement.
      const nuskNum = row.nuskAgentNumber ? String(row.nuskAgentNumber) : null;
      const aName = row.agentName ? String(row.agentName) : null;
      if (!nuskNum && !aName) {
        diff.rowsWithoutAgent++;
      } else {
        const matchesByNuskNumber = nuskNum != null && knownByNuskNumber.has(nuskNum);
        const matchesByName = aName != null && knownByName.has(aName);
        if (!matchesByNuskNumber && !matchesByName) {
          // The synthetic key matches the upsert key resolveAgent uses
          // when no match exists, so re-imports of the same file aggregate
          // into one entry instead of duplicating.
          const finalName = aName ?? `وكيل ${nuskNum}`;
          const key = `${nuskNum ?? ""}::${finalName}`;
          const entry = newAgentsMap.get(key);
          if (entry) entry.count++;
          else newAgentsMap.set(key, { nuskAgentNumber: nuskNum, agentName: finalName, count: 1 });
        }
      }
    }

    diff.unlinkedSubAgents = [...unlinkedMap.entries()].map(([nuskCode, { name, count }]) => ({
      nuskCode, name, rowCount: count,
    }));
    diff.newAgentsToCreate = [...newAgentsMap.values()].map((v) => ({
      nuskAgentNumber: v.nuskAgentNumber,
      agentName: v.agentName,
      rowCount: v.count,
    }));
  } else {
    const invoiceNumbers = rows.map((r) => r.nuskInvoiceNumber).filter(Boolean) as string[];
    if (invoiceNumbers.length === 0) return diff;

    const existing = await rawQuery<Record<string, unknown>>(
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
                    "entryPort", "exitPort", "overstayDays", "actualStayDays",
                    "entryDate", "exitDate"
             FROM umrah_pilgrims
             WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
            [scope.companyId, nuskNumbers]
          )).rows
        : [];
      const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

      for (const row of batch) {
        if (!row.nuskNumber) { errorCount++; continue; }
        await client.query("SAVEPOINT sp_row");
        try {
          const groupId = await resolveGroup(client, scope, row);
          const agentId = await resolveAgent(client, scope, row);
          const subAgentId = await resolveSubAgent(client, scope, row, agentId);

          const ex = existMap.get(String(row.nuskNumber));
          if (!ex) {
            const ppEnc = row.passportNumber ? encryptField(String(row.passportNumber)) : null;
            const ppHash = row.passportNumber ? blindIndex(String(row.passportNumber)) : null;
            const visaEnc = row.visaNumber ? encryptField(String(row.visaNumber)) : null;
            const visaHash = row.visaNumber ? blindIndex(String(row.visaNumber)) : null;
            const mofaEnc = row.mofaNumber ? encryptField(String(row.mofaNumber)) : null;
            const mofaHash = row.mofaNumber ? blindIndex(String(row.mofaNumber)) : null;
            const borderEnc = row.borderNumber ? encryptField(String(row.borderNumber)) : null;
            const borderHash = row.borderNumber ? blindIndex(String(row.borderNumber)) : null;
            const res = await client.query(
              `INSERT INTO umrah_pilgrims
               ("companyId","branchId","seasonId","nuskNumber","fullName",nationality,gender,
                "passportNumber","passportNumber_hash","passportExpiry","visaNumber","visaNumber_hash",
                "groupId","subAgentId","agentId",
                status,"entryDate","exitDate","entryPort","entryFlight","exitPort","exitFlight",
                "actualStayDays","programDuration","overstayDays",
                "borderNumber","borderNumber_hash","mofaNumber","mofaNumber_hash",
                "isInsideKingdom","hasUmrahPermit","createdBy","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW(),NOW())
               RETURNING id`,
              [
                scope.companyId, scope.branchId, scope.seasonId,
                row.nuskNumber, row.fullName, row.nationality, row.gender,
                ppEnc, ppHash, row.passportExpiry || null, visaEnc, visaHash,
                groupId, subAgentId, agentId,
                row.status || "pending",
                row.entryDate || null, row.exitDate || null,
                row.entryPort || null, row.entryFlight || null,
                row.exitPort || null, row.exitFlight || null,
                row.actualStayDays ?? null, row.programDuration ?? 14, row.overstayDays ?? 0,
                borderEnc, borderHash, mofaEnc, mofaHash,
                row.isInsideKingdom ?? false, row.hasUmrahPermit ?? false,
                scope.userId,
              ]
            );
            await logChange(client, batchId, "mutamer", res.rows[0].id, "created");
            newCount++;

            if (row.status === "overstayed" || row.status === "violated") {
              await detectViolation(client, scope, row, res.rows[0].id, groupId, subAgentId, agentId);
            }
          } else {
            const FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays", "entryDate", "exitDate"];
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
              changes.push(`"updatedAt"=NOW()`);
              vals.push(ex.id);
              vals.push(scope.companyId);
              await client.query(
                `UPDATE umrah_pilgrims SET ${changes.join(",")} WHERE id=$${vals.length - 1} AND "companyId"=$${vals.length}`,
                vals
              );
              updatedCount++;
              if (hasFinancial) financialImpactCount++;

              if ((row.status === "overstayed" || row.status === "violated") && ex.status !== row.status) {
                await detectViolation(client, scope, row, ex.id, groupId, subAgentId, agentId);
              }
            } else {
              await logChange(client, batchId, "mutamer", ex.id, "skipped");
              skippedCount++;
            }
          }
          await client.query("RELEASE SAVEPOINT sp_row");
        } catch (err: any) {
          await client.query("ROLLBACK TO SAVEPOINT sp_row");
          await client.query("RELEASE SAVEPOINT sp_row");
          const msg = String(err?.message || "");
          // Treat duplicate (companyId, passportNumber, seasonId) as skipped (idempotent)
          if (/duplicate key|unique constraint|already exists/i.test(msg) && /passport/i.test(msg)) {
            skippedCount++;
            try { await logChange(client, batchId, "mutamer", 0, "skipped", null, null, "duplicate"); } catch (e) { logger.error(e, "umrah import logChange failed"); }
          } else {
            errorCount++;
            try { await logChange(client, batchId, "mutamer", 0, "error", null, null, msg); } catch (e) { logger.error(e, "umrah import logChange failed"); }
          }
        }
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.mutamers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

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
      await client.query("SAVEPOINT sp_row");
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
              "programDuration","treasuryId","createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),NOW())
             RETURNING id`,
            [
              scope.companyId, scope.branchId, row.nuskInvoiceNumber,
              agentId, subAgentId, groupId,
              row.mutamerCount ?? 0,
              row.groundServices ?? 0, row.electronicFees ?? 0, row.visaFees ?? 0,
              row.insuranceFees ?? 0, row.enrichmentServices ?? 0, row.additionalServices ?? 0,
              row.transportTotal ?? 0, row.hotelTotal ?? 0, row.refundAmount ?? 0,
              row.netCost ?? 0, row.totalAmount ?? 0,
              row.nuskStatus || "pending",
              row.issueDate || null, row.expiryDate || null,
              row.programDuration ?? null,
              scope.treasuryId ?? null,
              scope.userId,
            ]
          );
          await logChange(client, batchId, "nusk_invoice", res.rows[0].id, "created");

          const nuskId = res.rows[0].id;
          await postNuskJournalEntries(client, scope, {
            nuskId,
            nuskInvoiceNumber: String(row.nuskInvoiceNumber),
            totalAmount: Number(row.totalAmount ?? 0),
            refundAmount: Number(row.refundAmount ?? 0),
            nuskStatus: String(row.nuskStatus || "pending").toLowerCase(),
            existingApJeId: null,
            existingRefundJeId: null,
          });

          newCount++;
        } else {
          const FIELDS = ["totalAmount", "netCost", "nuskStatus", "mutamerCount", "refundAmount"];
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
                f === "totalAmount" || f === "netCost" || f === "refundAmount");
              if (f === "totalAmount" || f === "netCost" || f === "refundAmount") hasFinancial = true;
            }
          }

          if (groupId && ex.groupId !== groupId) { vals.push(groupId); changes.push(`"groupId"=$${vals.length}`); }
          if (subAgentId && ex.subAgentId !== subAgentId) { vals.push(subAgentId); changes.push(`"subAgentId"=$${vals.length}`); }

          if (changes.length > 0) {
            vals.push(scope.userId);
            changes.push(`"updatedBy"=$${vals.length}`);
            changes.push(`"updatedAt"=NOW()`);
            vals.push(ex.id);
            vals.push(scope.companyId);
            await client.query(
              `UPDATE umrah_nusk_invoices SET ${changes.join(",")} WHERE id=$${vals.length - 1} AND "companyId"=$${vals.length}`,
              vals
            );
            updatedCount++;
            if (hasFinancial) financialImpactCount++;
          } else {
            skippedCount++;
          }

          // Always re-evaluate journal entries — backfills legacy rows missing AP,
          // and posts the refund reversal the first time status transitions to 'refunded'.
          // postNuskJournalEntries is idempotent via sourceKey + existing-id guards.
          await postNuskJournalEntries(client, scope, {
            nuskId: ex.id,
            nuskInvoiceNumber: String(row.nuskInvoiceNumber),
            totalAmount: Number(row.totalAmount ?? ex.totalAmount ?? 0),
            refundAmount: Number(row.refundAmount ?? ex.refundAmount ?? 0),
            nuskStatus: String(row.nuskStatus ?? ex.nuskStatus ?? "pending").toLowerCase(),
            existingApJeId: ex.purchaseInvoiceId ?? null,
            existingRefundJeId: ex.journalEntryId ?? null,
          });
        }
        await client.query("RELEASE SAVEPOINT sp_row");
      } catch (err: any) {
        await client.query("ROLLBACK TO SAVEPOINT sp_row");
        await client.query("RELEASE SAVEPOINT sp_row");
        const msg = String(err?.message || "");
        if (/duplicate key|unique constraint|already exists/i.test(msg)) {
          skippedCount++;
          try { await logChange(client, batchId, "nusk_invoice", 0, "skipped", null, null, "duplicate"); } catch (e) { logger.error(e, "umrah import logChange failed"); }
        } else {
          errorCount++;
          try { await logChange(client, batchId, "nusk_invoice", 0, "error", null, null, msg); } catch (e) { logger.error(e, "umrah import logChange failed"); }
        }
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.vouchers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    return { batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount };
  });
}

// ---------------------------------------------------------------------------
// Helper: post NUSK invoice journal entries (AP on receipt + refund reversal)
// ---------------------------------------------------------------------------
//
// Accounting rules:
//   * AP (DR cost / CR nusk payables) posts on receipt for ANY status that
//     represents a real obligation — i.e. anything except 'cancelled'. The
//     prior behaviour gated this on status='paid' which left pending/issued
//     invoices unbooked and silently understated AP on the trial balance.
//   * Refund reversal (DR nusk payables / CR cost) posts when status is
//     'refunded' AND refundAmount > 0. It cancels the original obligation
//     up to the refund amount.
//
// Idempotency: caller passes the row's existingApJeId / existingRefundJeId;
//   we skip posting when they are already set. createGuardedJournalEntry
//   itself also dedupes via sourceKey, so a re-run is always safe.
async function postNuskJournalEntries(
  client: pg.PoolClient,
  scope: ImportScope,
  params: {
    nuskId: number;
    nuskInvoiceNumber: string;
    totalAmount: number;
    refundAmount: number;
    nuskStatus: string;
    existingApJeId: number | null;
    existingRefundJeId: number | null;
  },
): Promise<void> {
  const { nuskId, nuskInvoiceNumber, totalAmount, refundAmount, nuskStatus, existingApJeId, existingRefundJeId } = params;

  if (totalAmount > 0 && nuskStatus !== "cancelled" && !existingApJeId) {
    try {
      const expCode = scope.purchaseAccountCode
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5201");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2101");
      const apJeId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.userId,
        ref: `NUSK-JE-${nuskInvoiceNumber}`,
        description: `قيد فاتورة نسك ${nuskInvoiceNumber}`,
        type: "purchase",
        sourceType: "umrah_nusk_invoices",
        sourceId: nuskId,
        sourceKey: `umrah_nusk_ap_${nuskId}`,
        lines: [
          { accountCode: expCode, debit: totalAmount, credit: 0, description: "تكلفة خدمات نسك" },
          { accountCode: apCode, debit: 0, credit: totalAmount, description: "مستحقات نسك" },
        ],
      }, { table: "umrah_nusk_invoices", id: nuskId });
      if (apJeId) {
        await client.query(
          `UPDATE umrah_nusk_invoices SET "purchaseInvoiceId"=$1 WHERE id=$2 AND "companyId"=$3`,
          [apJeId, nuskId, scope.companyId]
        );
      }
    } catch (jeErr) {
      logger.error(jeErr, `[UmrahImport] AP journal entry failed for NUSK ${nuskInvoiceNumber}`);
    }
  }

  if (nuskStatus === "refunded" && refundAmount > 0 && !existingRefundJeId) {
    try {
      const expCode = scope.purchaseAccountCode
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5201");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2101");
      const refundJeId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.userId,
        ref: `NUSK-RFD-${nuskInvoiceNumber}`,
        description: `قيد إرجاع فاتورة نسك ${nuskInvoiceNumber}`,
        type: "purchase",
        sourceType: "umrah_nusk_invoices",
        sourceId: nuskId,
        sourceKey: `umrah_nusk_refund_${nuskId}`,
        lines: [
          { accountCode: apCode, debit: refundAmount, credit: 0, description: "عكس مستحقات نسك — إرجاع" },
          { accountCode: expCode, debit: 0, credit: refundAmount, description: "عكس تكلفة خدمات نسك — إرجاع" },
        ],
      }, { table: "umrah_nusk_invoices", id: nuskId });
      if (refundJeId) {
        await client.query(
          `UPDATE umrah_nusk_invoices SET "journalEntryId"=$1 WHERE id=$2 AND "companyId"=$3`,
          [refundJeId, nuskId, scope.companyId]
        );
      }
    } catch (jeErr) {
      logger.error(jeErr, `[UmrahImport] Refund reversal journal entry failed for NUSK ${nuskInvoiceNumber}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: auto-resolve agent / sub-agent / group
// ---------------------------------------------------------------------------

async function resolveAgent(client: pg.PoolClient, scope: ImportScope, row: ParsedRow): Promise<number | null> {
  if (!row.nuskAgentNumber && !row.agentName) return null;
  if (row.nuskAgentNumber) {
    const [ex] = (await client.query(
      `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND "contractRef"=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, row.nuskAgentNumber]
    )).rows;
    if (ex) return ex.id;
  }
  const agentName = row.agentName || `وكيل ${row.nuskAgentNumber}`;
  const [exByName] = (await client.query(
    `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, agentName]
  )).rows;
  if (exByName) return exByName.id;
  const res = await client.query(
    `INSERT INTO umrah_agents ("companyId",name,"contractRef","createdAt","updatedAt")
     VALUES ($1,$2,$3,NOW(),NOW())
     RETURNING id`,
    [scope.companyId, agentName, row.nuskAgentNumber || null]
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
  const type = row.status === "violated" ? "absconded" : "overstay";
  const [exists] = (await client.query(
    `SELECT id FROM umrah_violations
     WHERE "companyId"=$1 AND "mutamerId"=$2 AND type=$3 AND "deletedAt" IS NULL`,
    [scope.companyId, mutamerId, type]
  )).rows;
  if (exists) return;

  const penalty = type === "absconded" ? 2000 : (Number(row.overstayDays) || 0) * 200;

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
  }).catch((e) => logger.error(e, "umrah import event emit failed"));
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
