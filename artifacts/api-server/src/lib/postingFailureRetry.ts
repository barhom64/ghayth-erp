// ─── Posting-failure retry dispatcher ────────────────────────────────────────
// Task #456 — re-invokes the ORIGINAL GL posting for a parked
// `financial_posting_failures` row so admins can drain the backlog after the
// underlying account mapping is fixed, instead of resolving rows blindly.
//
// Every supported posting path is idempotent by `sourceKey`, so a retry that
// races a fix (or re-runs after a prior success) returns the existing journal
// entry rather than double-posting. Source types we cannot safely reconstruct
// (no stored period, deleted source, ad-hoc cross-module obligations) report
// `supported: false` — the caller then offers manual resolution only.
//
// Task #458 — extended automatic retry to the cross-module obligation
// registrations (`expense_obligation`, `obligation_registration`). Both re-call
// `registerObligation`, which is idempotent by `dedupeKey`, so a retry either
// recreates the missing obligation or no-ops on the existing one. The remaining
// parked types either cannot be reconstructed from the failure row alone
// (`commission_calculation` / `employee_commission_calculations` need the
// original month/year; `umrah_agent_invoice` needs the full line breakdown;
// `commission_payroll_link` needs an active run for the original period and
// could corrupt a closed one) or are not financial postings at all
// (`hr_letter_dispatch`). These keep returning `supported: false` with a
// specific Arabic reason so the caller steers to manual resolution.

import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

export interface RetryScope {
  companyId: number;
  branchId: number;
  userId: number;
}

// Source types that have NO safe automatic retry (see the switch below). The
// bulk `retry-all` drain excludes these so it never wastes a batch on rows it
// can't post — they must be handled manually or dismissed. Keep in sync with
// the `supported: false` cases in `retryPostingFailure`.
export const UNSUPPORTED_RETRY_SOURCE_TYPES: readonly string[] = [
  "commission_calculation",
  "employee_commission_calculations",
  "umrah_agent_invoice",
  "commission_payroll_link",
  "hr_letter_dispatch",
];

export interface RetryResult {
  ok: boolean;
  /** false → this sourceType has no safe automatic retry; resolve manually. */
  supported: boolean;
  message: string;
}

const NOT_SUPPORTED = (sourceType: string): RetryResult => ({
  ok: false,
  supported: false,
  message: `لا تتوفر إعادة محاولة تلقائية لهذا النوع (${sourceType}). عالج السبب يدوياً ثم أغلق السجل.`,
});

// Same `supported: false` contract as NOT_SUPPORTED, but with a type-specific
// Arabic reason explaining *why* there is no safe automatic retry.
const NOT_SUPPORTED_REASON = (message: string): RetryResult => ({
  ok: false,
  supported: false,
  message,
});

export async function retryPostingFailure(
  scope: RetryScope,
  failure: { sourceType: string; sourceId: number | null },
): Promise<RetryResult> {
  const { sourceType, sourceId } = failure;
  if (sourceId == null || sourceId <= 0) return NOT_SUPPORTED(sourceType);

  const { umrahEngine } = await import("./engines/index.js");
  const glCtx = { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId };

  try {
    switch (sourceType) {
      case "umrah_penalty":
      case "umrah_penalty_waiver": {
        const [pen] = await rawQuery<{
          id: number; pilgrimId: number | null; agentId: number | null; seasonId: number | null;
          type: string; amount: string | number;
        }>(
          `SELECT id, "pilgrimId", "agentId", "seasonId", type, amount
             FROM umrah_penalties WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [sourceId, scope.companyId],
        );
        if (!pen) {
          return { ok: true, supported: true, message: "المصدر غير موجود (محذوف) — تم إغلاق السجل." };
        }
        const amount = Number(pen.amount);
        if (!(amount > 0)) {
          return { ok: true, supported: true, message: "قيمة الغرامة صفر — لا يوجد قيد للترحيل، تم الإغلاق." };
        }
        let pilgrimName = "غير محدد";
        let agentName: string | undefined;
        if (pen.pilgrimId) {
          const [p] = await rawQuery<{ fullName: string }>(
            `SELECT "fullName" FROM umrah_pilgrims WHERE id = $1 AND "companyId" = $2`,
            [pen.pilgrimId, scope.companyId],
          );
          if (p?.fullName) pilgrimName = p.fullName;
        }
        if (pen.agentId) {
          const [a] = await rawQuery<{ name: string }>(
            `SELECT name FROM umrah_agents WHERE id = $1 AND "companyId" = $2`,
            [pen.agentId, scope.companyId],
          );
          if (a?.name) agentName = a.name;
        }
        const agentId = pen.agentId ?? undefined;
        const seasonId = pen.seasonId ?? undefined;
        if (sourceType === "umrah_penalty_waiver") {
          await umrahEngine.postPenaltyWaiverGL(glCtx, { id: pen.id, amount, pilgrimName, agentId, seasonId });
        } else {
          await umrahEngine.postPenaltyGL(glCtx, { id: pen.id, amount, pilgrimName, agentName, type: pen.type, agentId, seasonId });
        }
        return { ok: true, supported: true, message: "تمت إعادة الترحيل بنجاح." };
      }

      case "umrah_transport": {
        const [tr] = await rawQuery<{
          id: number; cost: string | number; fromLocation: string | null; toLocation: string | null;
          vehicleId: number | null; driverId: number | null; seasonId: number | null;
        }>(
          `SELECT id, cost, "fromLocation", "toLocation", "vehicleId", "driverId", "seasonId"
             FROM umrah_transport WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [sourceId, scope.companyId],
        );
        if (!tr) {
          return { ok: true, supported: true, message: "المصدر غير موجود (محذوف) — تم إغلاق السجل." };
        }
        const cost = Number(tr.cost);
        if (!(cost > 0)) {
          return { ok: true, supported: true, message: "تكلفة النقل صفر — لا يوجد قيد للترحيل، تم الإغلاق." };
        }
        await umrahEngine.postTransportExpenseGL(glCtx, {
          id: tr.id, cost,
          fromLocation: tr.fromLocation ?? "—", toLocation: tr.toLocation ?? "—",
          vehicleId: tr.vehicleId ?? undefined, driverId: tr.driverId ?? undefined,
          umrahSeasonId: tr.seasonId ?? undefined,
        });
        return { ok: true, supported: true, message: "تمت إعادة الترحيل بنجاح." };
      }

      // Cross-module: re-register the payment obligation for an expense. The
      // original `expense.created` listener registers an obligation keyed
      // `expense-<journalId>`; sourceId here is that journal entry id. Mirrors
      // the listener's >0 gate so a zero-value expense closes without a no-op
      // obligation. registerObligation is idempotent by dedupeKey.
      case "expense_obligation": {
        const { registerObligation } = await import("./obligationsEngine.js");
        const [je] = await rawQuery<{ branchId: number | null; amount: string | number }>(
          `SELECT je."branchId",
                  COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl WHERE jl."journalId" = je.id), 0) AS amount
             FROM journal_entries je
            WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`,
          [sourceId, scope.companyId],
        );
        if (!je) {
          return { ok: true, supported: true, message: "المصدر غير موجود (محذوف) — تم إغلاق السجل." };
        }
        const amount = Number(je.amount);
        if (!(amount > 0)) {
          return { ok: true, supported: true, message: "قيمة المصروف صفر — لا يوجد التزام للتسجيل، تم الإغلاق." };
        }
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        await registerObligation({
          companyId: scope.companyId,
          branchId: je.branchId ?? scope.branchId,
          entityType: "expenses",
          entityId: sourceId,
          obligationType: "payment",
          title: `مصروف #${sourceId} — ${amount} ر.س`,
          dueAt: dueDate,
          dedupeKey: `expense-${sourceId}`,
        });
        return { ok: true, supported: true, message: "تمت إعادة تسجيل الالتزام بنجاح." };
      }

      // Cross-module: re-register the receivable obligation for an umrah sales
      // invoice. The original `umrah.invoice.created` listener registers an
      // obligation keyed `umrah-inv-<invoiceId>`; sourceId here is that invoice
      // id. registerObligation is idempotent by dedupeKey.
      case "obligation_registration": {
        const { registerObligation } = await import("./obligationsEngine.js");
        const [inv] = await rawQuery<{ ref: string | null; total: string | number; branchId: number | null }>(
          `SELECT ref, total, "branchId" FROM umrah_sales_invoices
            WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [sourceId, scope.companyId],
        );
        if (!inv) {
          return { ok: true, supported: true, message: "المصدر غير موجود (محذوف) — تم إغلاق السجل." };
        }
        const total = Number(inv.total) || 0;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await registerObligation({
          companyId: scope.companyId,
          branchId: inv.branchId ?? scope.branchId,
          entityType: "umrah_sales_invoices",
          entityId: sourceId,
          obligationType: "payment",
          title: `فاتورة عمرة ${inv.ref || ""} — ${total} ر.س`,
          dueAt: dueDate,
          dedupeKey: `umrah-inv-${sourceId}`,
        });
        return { ok: true, supported: true, message: "تمت إعادة تسجيل الالتزام بنجاح." };
      }

      // Deferred: needs the original month/year, which is only encoded in the
      // error text and not stored as a column on the failure row.
      case "commission_calculation":
      case "employee_commission_calculations":
        return NOT_SUPPORTED_REASON(
          "حساب العمولة يتطلب الشهر/السنة الأصليين غير المخزّنين في السجل — عالجه يدوياً ثم أغلق السجل.",
        );

      // Deferred: needs the full invoice line breakdown reconstructed, which is
      // not recoverable from the failure row alone.
      case "umrah_agent_invoice":
        return NOT_SUPPORTED_REASON(
          "فاتورة الوكيل تتطلب إعادة بناء بنود الفاتورة كاملة — عالجها يدوياً ثم أغلق السجل.",
        );

      // Deferred: requires an active payroll run for the original period (only
      // in the error text), and re-linking into a finalized run would corrupt a
      // closed payroll. Resolve manually instead.
      case "commission_payroll_link":
        return NOT_SUPPORTED_REASON(
          "ربط العمولة بمسيّر الرواتب يتطلب مسيّراً نشطاً للفترة الأصلية وقد يفسد مسيّراً مغلقاً — عالجه يدوياً ثم أغلق السجل.",
        );

      // Not a financial posting — letter dispatch is re-triggered from the
      // official-letters screen, not from this GL retry dispatcher.
      case "hr_letter_dispatch":
        return NOT_SUPPORTED_REASON(
          "إرسال الخطاب الرسمي ليس قيداً مالياً ويُعاد تشغيله من شاشة الخطابات — عالجه يدوياً ثم أغلق السجل.",
        );

      default:
        return NOT_SUPPORTED(sourceType);
    }
  } catch (err) {
    logger.warn(err, `[postingFailureRetry] retry failed for ${sourceType}#${sourceId}`);
    return {
      ok: false,
      supported: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
