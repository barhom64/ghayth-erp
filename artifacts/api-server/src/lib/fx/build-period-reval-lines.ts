/**
 * بناء سطور قيد إعادة تقييم العملات للفترة — مفصّلة لكل كيان (الخيار أ).
 *
 * طبقة نقية (بلا I/O) تُستخرَج من مسار `POST /finance/fx/revaluation/post`
 * (routes/finance-algorithms.ts) لتجعل بناء سطور القيد قابلًا للاختبار وحدةً
 * تحت عقد البُعد (assertDimensionContract / assertLedgerTruth).
 *
 * لماذا التفصيل؟ عقد البُعد (lib/gl/ledgerTruth.ts) يفرض (enforce) ربط الحساب
 * 1131 (ذمم مدينة) بعميل والحساب 2111 (ذمم دائنة) بمورد. القيد المجمّع القديم
 * كان يضع سطر AR/AP واحدًا بلا clientId/vendorId → يرميه assertDimensionContract
 * عند الترحيل. الإصلاح يفصّل: سطر AR لكل عميل يحمل clientId، وسطر AP لكل مورد
 * يحمل vendorId، مع إبقاء سطرَي المكسب/الخسارة إجماليين بلا بُعد.
 *
 * مبدأ صارم: التفصيل لا يغيّر إجمالي المكسب/الخسارة ولا التوازن — يوزّع فقط
 * طرف AR/AP على الكيانات. صافي كل كيان يُحتسب على حدة، والصافي الصفري يُحذف.
 *
 * بند بلا بُعد (فاتورة بلا clientId / أمر شراء بلا supplierId): يُتخطّى ويُسجَّل
 * في `skipped` بسبب واضح بدل إنتاج سطر يفشل الإنفاذ. لا يُسقَط الصافي بصمت.
 */
import { roundTo2 } from "../businessHelpers.js";

export interface FxRevalInvoiceRow {
  id: number;
  ref: string | null;
  currency: string | null;
  exchangeRate: number | string | null;
  total: number | string | null;
  paidAmount: number | string | null;
  clientId: number | string | null;
}

export interface FxRevalPoRow {
  id: number;
  ref: string | null;
  currency: string | null;
  exchangeRate: number | string | null;
  totalAmount: number | string | null;
  supplierId: number | string | null;
}

export interface FxRevalAccountCodes {
  arCode: string;
  apCode: string;
  gainCode: string;
  lossCode: string;
}

export interface FxRevalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
  /** بُعد العميل (سطور AR فقط). */
  clientId?: number;
  /** بُعد المورد (سطور AP فقط). */
  vendorId?: number;
}

export interface FxRevalDetail {
  kind: "AR" | "AP";
  refId: number;
  refNumber: string | null;
  currency: string | null;
  diff: number;
}

export interface FxRevalSkipped {
  kind: "AR" | "AP";
  refId: number;
  refNumber: string | null;
  currency: string | null;
  diff: number;
  reason: string;
}

export interface BuildFxRevalLinesResult {
  lines: FxRevalLine[];
  /** صافي تعديل AR الإجمالي (موجب = DR على الأصل). للتدقيق/التوافق. */
  arDiff: number;
  /** صافي تعديل AP الإجمالي (موجب = CR على الالتزام). للتدقيق/التوافق. */
  apDiff: number;
  totalGain: number;
  totalLoss: number;
  details: FxRevalDetail[];
  skipped: FxRevalSkipped[];
}

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * يبني سطور قيد إعادة التقييم مفصّلة لكل كيان.
 *
 * - سطر AR لكل عميل (صافي فروقه) يحمل clientId — على الحساب arCode.
 * - سطر AP لكل مورد (صافي فروقه) يحمل vendorId — على الحساب apCode.
 * - سطر مكسب إجمالي (CR gainCode) + سطر خسارة إجمالي (DR lossCode) بلا بُعد.
 *
 * المكسب/الخسارة يُحتسبان من صافي كل كيان (بعد جمع فروقه)، فيطابقان مجموع
 * أطراف AR/AP تمامًا ويبقى القيد متوازنًا.
 */
export function buildPeriodRevalLines(opts: {
  invoices: FxRevalInvoiceRow[];
  purchaseOrders: FxRevalPoRow[];
  rateMap: Record<string, number>;
  accounts: FxRevalAccountCodes;
  period: string;
}): BuildFxRevalLinesResult {
  const { invoices, purchaseOrders, rateMap, accounts, period } = opts;

  const details: FxRevalDetail[] = [];
  const skipped: FxRevalSkipped[] = [];

  // صافي فرق لكل عميل / لكل مورد.
  const byClient = new Map<number, number>();
  const byVendor = new Map<number, number>();

  let arDiff = 0;
  let apDiff = 0;

  // ── الذمم المدينة (AR) — لكل فاتورة ──────────────────────────────────
  for (const inv of invoices) {
    const closing = rateMap[String(inv.currency)] || 0;
    if (!closing) continue;
    const booked = num(inv.exchangeRate) || 1;
    const outstandingFc = num(inv.total) - num(inv.paidAmount);
    const diff = roundTo2(outstandingFc * (closing - booked));
    if (Math.abs(diff) < 0.01) continue;

    const clientId = inv.clientId == null ? null : Number(inv.clientId);
    if (clientId == null || !Number.isFinite(clientId) || clientId <= 0) {
      // فاتورة بلا عميل — لا يمكن إنتاج سطر AR يجتاز عقد البُعد. تخطٍّ مُسجَّل.
      skipped.push({
        kind: "AR",
        refId: inv.id,
        refNumber: inv.ref,
        currency: inv.currency,
        diff,
        reason: "فاتورة بلا عميل (clientId) — لا يمكن ربط سطر الذمم المدينة بالبُعد المطلوب",
      });
      continue;
    }

    arDiff += diff;
    byClient.set(clientId, roundTo2((byClient.get(clientId) ?? 0) + diff));
    details.push({ kind: "AR", refId: inv.id, refNumber: inv.ref, currency: inv.currency, diff });
  }

  // ── الذمم الدائنة (AP) — لكل أمر شراء ────────────────────────────────
  for (const po of purchaseOrders) {
    const closing = rateMap[String(po.currency)] || 0;
    if (!closing) continue;
    const booked = num(po.exchangeRate) || 1;
    const outstandingFc = num(po.totalAmount);
    const diff = roundTo2(outstandingFc * (closing - booked));
    if (Math.abs(diff) < 0.01) continue;

    const vendorId = po.supplierId == null ? null : Number(po.supplierId);
    if (vendorId == null || !Number.isFinite(vendorId) || vendorId <= 0) {
      // أمر شراء بلا مورد — لا يمكن إنتاج سطر AP يجتاز عقد البُعد. تخطٍّ مُسجَّل.
      skipped.push({
        kind: "AP",
        refId: po.id,
        refNumber: po.ref,
        currency: po.currency,
        diff,
        reason: "أمر شراء بلا مورد (supplierId) — لا يمكن ربط سطر الذمم الدائنة بالبُعد المطلوب",
      });
      continue;
    }

    apDiff += diff;
    byVendor.set(vendorId, roundTo2((byVendor.get(vendorId) ?? 0) + diff));
    details.push({ kind: "AP", refId: po.id, refNumber: po.ref, currency: po.currency, diff });
  }

  arDiff = roundTo2(arDiff);
  apDiff = roundTo2(apDiff);

  const lines: FxRevalLine[] = [];
  let totalGain = 0;
  let totalLoss = 0;

  // سطر AR لكل عميل. AR أصل: فرق موجب = DR (الأصل يرتفع → مكسب) ؛ فرق سالب = CR (خسارة).
  for (const [clientId, net] of byClient) {
    if (Math.abs(net) < 0.01) continue; // صافي صفري يُحذف
    if (net > 0) {
      lines.push({
        accountCode: accounts.arCode,
        debit: net,
        credit: 0,
        description: `إعادة تقييم ذمم مدينة — عميل ${clientId} — ${period}`,
        clientId,
      });
      totalGain = roundTo2(totalGain + net);
    } else {
      const v = -net;
      lines.push({
        accountCode: accounts.arCode,
        debit: 0,
        credit: v,
        description: `إعادة تقييم ذمم مدينة — عميل ${clientId} — ${period}`,
        clientId,
      });
      totalLoss = roundTo2(totalLoss + v);
    }
  }

  // سطر AP لكل مورد. AP التزام: فرق موجب = CR (الالتزام يرتفع → خسارة) ؛ فرق سالب = DR (مكسب).
  for (const [vendorId, net] of byVendor) {
    if (Math.abs(net) < 0.01) continue; // صافي صفري يُحذف
    if (net > 0) {
      lines.push({
        accountCode: accounts.apCode,
        debit: 0,
        credit: net,
        description: `إعادة تقييم ذمم دائنة — مورد ${vendorId} — ${period}`,
        vendorId,
      });
      totalLoss = roundTo2(totalLoss + net);
    } else {
      const v = -net;
      lines.push({
        accountCode: accounts.apCode,
        debit: v,
        credit: 0,
        description: `إعادة تقييم ذمم دائنة — مورد ${vendorId} — ${period}`,
        vendorId,
      });
      totalGain = roundTo2(totalGain + v);
    }
  }

  totalGain = roundTo2(totalGain);
  totalLoss = roundTo2(totalLoss);

  // سطر المكسب الإجمالي (CR) + سطر الخسارة الإجمالي (DR) — بلا بُعد.
  if (totalGain > 0) {
    lines.push({
      accountCode: accounts.gainCode,
      debit: 0,
      credit: totalGain,
      description: `ربح صرف غير محقق — ${period}`,
    });
  }
  if (totalLoss > 0) {
    lines.push({
      accountCode: accounts.lossCode,
      debit: totalLoss,
      credit: 0,
      description: `خسارة صرف غير محققة — ${period}`,
    });
  }

  return { lines, arDiff, apDiff, totalGain, totalLoss, details, skipped };
}
