import { useState, useEffect } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { formatCurrency, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * VAT Reconciliation report page — UI for #1037's
 * GET /reports/vat-reconciliation endpoint.
 *
 * Pre-filing sanity check that ties out the period's Output−Input VAT
 * movement against the live VAT-account balance. A non-zero drift
 * means a JE landed on the VAT account from a non-standard source
 * OR a period boundary was misposted — operator must reconcile
 * BEFORE submitting the monthly ZATCA return.
 */

interface VatReconResponse {
  filters: { startDate?: string; endDate?: string };
  accounts: { outputVatCode: string; inputVatCode: string };
  summary: {
    outputVatPeriod: number;
    inputVatPeriod: number;
    netVatDue: number;
    outputVatLiveBalance: number;
    inputVatLiveBalance: number;
    liveNetPayable: number;
    drift: number;
    driftIsClean: boolean;
  };
  bySource: Array<{
    sourceType: string;
    outputVat: number;
    inputVat: number;
    netVat: number;
  }>;
}

const SOURCE_LABELS: Record<string, string> = {
  invoice:     "فواتير المبيعات",
  credit_memo: "إشعارات دائنة",
  debit_memo:  "إشعارات مدينة",
  voucher:     "سندات",
  payment:     "دفعات",
  expense:     "مصروفات",
  purchase:    "مشتريات",
  grn:         "إيصالات استلام",
  other:       "أخرى",
};

function startOfMonthLocal() {
  // Day-of-month from the Riyadh wall-clock; rebuild with day = 01.
  const t = todayLocal();
  return `${t.slice(0, 8)}01`;
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: VatReconResponse["bySource"], filename: string) {
  const headers = ["المصدر", "ضريبة المخرجات", "ضريبة المدخلات", "الصافي"];
  const out = rows.map((r) => [
    csvEscape(SOURCE_LABELS[r.sourceType] ?? r.sourceType),
    r.outputVat.toFixed(2),
    r.inputVat.toFixed(2),
    r.netVat.toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_vat_reconciliation",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

/**
 * سياسة تسوية الضريبة (دورية التقديم + مهلة الاستحقاق) — قياسية افتراضيًا
 * وقابلة للتعديل من الواجهة. تُحفظ في settings عبر PUT /finance/tax-settlement/policy.
 * النسبة وحسابات المخرجات/المدخلات تُعرض للقراءة فقط (مصدرها الأصلي لا يُكرَّر هنا).
 */
interface SettlementPolicy {
  frequency: "monthly" | "quarterly";
  filingDueDays: number;
  settlementAccountCode: string;
}
interface TaxSettlementPolicyResponse {
  key: string;
  policy: SettlementPolicy;
  standard: SettlementPolicy;
  refs: { vatRate: number; accounts: { output: string; input: string }; previewEndpoint: string };
}

function SettlementPolicyCard() {
  const { data, isLoading, isError } = useApiQuery<TaxSettlementPolicyResponse>(
    ["tax-settlement-policy"],
    "/finance/tax-settlement/policy",
  );
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [dueDays, setDueDays] = useState<string>("30");
  const [acct, setAcct] = useState<string>("2131");

  useEffect(() => {
    if (data?.policy) {
      setFrequency(data.policy.frequency);
      setDueDays(String(data.policy.filingDueDays));
      setAcct(data.policy.settlementAccountCode);
    }
  }, [data?.policy?.frequency, data?.policy?.filingDueDays, data?.policy?.settlementAccountCode]);

  const saveMut = useApiMutation<TaxSettlementPolicyResponse, { frequency: string; filingDueDays: number; settlementAccountCode: string }>(
    "/finance/tax-settlement/policy",
    "PUT",
    [["tax-settlement-policy"]],
    { successMessage: "تم حفظ سياسة التسوية" },
  );

  if (isLoading) return null;
  if (isError || !data) return null;

  const isStandard =
    data.policy.frequency === data.standard.frequency &&
    data.policy.filingDueDays === data.standard.filingDueDays &&
    data.policy.settlementAccountCode === data.standard.settlementAccountCode;
  const days = Number(dueDays);
  const acctTrim = acct.trim();
  const dirty =
    frequency !== data.policy.frequency ||
    days !== data.policy.filingDueDays ||
    acctTrim !== data.policy.settlementAccountCode;
  const valid = Number.isInteger(days) && days >= 1 && days <= 120 && acctTrim.length > 0;

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold">سياسة تسوية الضريبة</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              دورية تقديم الإقرار ومهلة الاستحقاق — افتراضي قياسي قابل للتعديل
            </p>
          </div>
          {isStandard && <Badge variant="outline">قياسي</Badge>}
        </div>

        <div className="grid gap-4 md:grid-cols-3 mt-4">
          {/* الدورية */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">دورية التسوية</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={frequency === "monthly" ? "default" : "outline"}
                onClick={() => setFrequency("monthly")}
              >شهري</Button>
              <Button
                type="button"
                size="sm"
                variant={frequency === "quarterly" ? "default" : "outline"}
                onClick={() => setFrequency("quarterly")}
              >ربع سنوي</Button>
            </div>
          </div>

          {/* مهلة الاستحقاق */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">مهلة الاستحقاق (أيام بعد نهاية الفترة)</label>
            <Input
              type="number"
              min={1}
              max={120}
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              className="w-32 tabular-nums"
            />
            {(!Number.isInteger(days) || days < 1 || days > 120) &&
              <p className="text-xs text-destructive mt-1">قيمة بين 1 و120 يومًا</p>}
          </div>

          {/* حساب التسوية — قابل للتخصيص */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">حساب التسوية (صافي المستحق)</label>
            <Input
              value={acct}
              onChange={(e) => setAcct(e.target.value)}
              className="w-32 font-mono"
              placeholder="2131"
            />
            {acctTrim.length === 0 && <p className="text-xs text-destructive mt-1">كود حساب مطلوب</p>}
          </div>
        </div>

        {/* مراجع للقراءة فقط */}
        <div className="text-xs text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>نسبة الضريبة: <span className="font-semibold">{(data.refs.vatRate * 100).toFixed(0)}%</span></span>
          <span>حساب المخرجات: <span className="font-mono">{data.refs.accounts.output}</span></span>
          <span>حساب المدخلات: <span className="font-mono">{data.refs.accounts.input}</span></span>
        </div>

        <div className="flex justify-end mt-4">
          <GuardedButton
            perm="finance:update"
            size="sm"
            disabled={!dirty || !valid || saveMut.isPending}
            onClick={() => saveMut.mutate({ frequency, filingDueDays: days, settlementAccountCode: acctTrim })}
          >
            {saveMut.isPending ? "جاري الحفظ" : "حفظ السياسة"}
          </GuardedButton>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ترحيل تسوية الضريبة لفترة — معاينة القيد المقترح (GET /tax-settlement/preview)
 * ثم ترحيله للدفتر بإجراء بشري متعمّد (POST /tax-settlement/post). idempotent:
 * إعادة الترحيل لا تنشئ قيدًا مكررًا. لا cron — التقديم قرار المستخدم.
 */
interface SettlementLine { accountCode: string; debit: number; credit: number }
interface SettlementPreview {
  period: string;
  accounts: { output: string; input: string; settlement: string };
  outputVat: number;
  inputVat: number;
  netVat: number;
  direction: "payable" | "refundable";
  lines: SettlementLine[];
  ref: string;
  alreadyPosted: boolean;
  postedJournalId: number | null;
}

function currentMonth() {
  return todayLocal().slice(0, 7); // YYYY-MM من توقيت الرياض
}

function SettlementPostPanel() {
  const [period, setPeriod] = useState(currentMonth());
  const valid = /^\d{4}-\d{2}$/.test(period);

  const { data, isLoading, isError, refetch } = useApiQuery<SettlementPreview>(
    ["tax-settlement-preview", period],
    `/finance/tax-settlement/preview?period=${period}`,
    { enabled: valid },
  );

  const postMut = useApiMutation<SettlementPreview, { period: string }>(
    "/finance/tax-settlement/post",
    "POST",
    [["tax-settlement-preview", period]],
    { successMessage: "تم ترحيل قيد التسوية" },
  );

  const hasMovement = !!data && data.lines.length >= 2;

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold">ترحيل تسوية الفترة</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              معاينة قيد التسوية المقترح ثم ترحيله للدفتر — قابل للإعادة بأمان (لا تكرار)
            </p>
          </div>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40"
          />
        </div>

        {!valid && <p className="text-xs text-destructive mt-3">صيغة الفترة YYYY-MM</p>}
        {valid && isLoading && <p className="text-xs text-muted-foreground mt-3">جاري التحميل…</p>}
        {valid && isError && <p className="text-xs text-destructive mt-3">تعذّر تحميل المعاينة</p>}

        {data && (
          <div className="mt-4">
            {data.alreadyPosted ? (
              <Badge className="bg-status-success-surface text-status-success-foreground">
                مُرحَّل — قيد رقم {data.postedJournalId}
              </Badge>
            ) : hasMovement ? (
              <>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">ضريبة المخرجات</p>
                    <p className="text-base font-semibold">{formatCurrency(data.outputVat)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ضريبة المدخلات</p>
                    <p className="text-base font-semibold">{formatCurrency(data.inputVat)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      الصافي ({data.direction === "payable" ? "مستحق للهيئة" : "قابل للاسترداد"})
                    </p>
                    <p className={`text-base font-bold ${data.direction === "payable" ? "text-orange-600" : "text-emerald-700"}`}>
                      {formatCurrency(Math.abs(data.netVat))}
                    </p>
                  </div>
                </div>

                {/* القيد المقترح */}
                <div className="rounded-md border divide-y text-sm">
                  <div className="grid grid-cols-3 px-3 py-1.5 text-xs text-muted-foreground bg-muted/40">
                    <span>الحساب</span><span className="text-end">مدين</span><span className="text-end">دائن</span>
                  </div>
                  {data.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-3 px-3 py-1.5 tabular-nums">
                      <span className="font-mono">{l.accountCode}</span>
                      <span className="text-end">{l.debit ? formatCurrency(l.debit) : "—"}</span>
                      <span className="text-end">{l.credit ? formatCurrency(l.credit) : "—"}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end mt-4">
                  <GuardedButton
                    perm="finance:update"
                    size="sm"
                    disabled={postMut.isPending}
                    onClick={() => postMut.mutate({ period }, { onSuccess: () => refetch() })}
                  >
                    {postMut.isPending ? "جاري الترحيل" : "ترحيل التسوية"}
                  </GuardedButton>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد حركة ضريبية في هذه الفترة للتسوية</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VatReconciliationPage() {
  const [startDate, setStartDate] = useState(startOfMonthLocal());
  const [endDate, setEndDate] = useState(todayLocal());

  const { data, isLoading, isError, refetch } = useApiQuery<VatReconResponse>(
    ["vat-reconciliation", startDate, endDate],
    `/finance/reports/vat-reconciliation?startDate=${startDate}&endDate=${endDate}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, bySource, accounts } = data;

  const columns: DataTableColumn<VatReconResponse["bySource"][number]>[] = [
    {
      key: "sourceType",
      header: "المصدر",
      sortable: true,
      render: (r) => (
        <span className="font-medium">
          {SOURCE_LABELS[r.sourceType] ?? r.sourceType}
        </span>
      ),
    },
    {
      key: "outputVat",
      header: "ضريبة المخرجات (مبيعات)",
      sortable: true,
      render: (r) =>
        r.outputVat !== 0
          ? <Badge className="bg-status-success-surface text-status-success-foreground">
              {formatCurrency(r.outputVat)}
            </Badge>
          : "—",
    },
    {
      key: "inputVat",
      header: "ضريبة المدخلات (مشتريات)",
      sortable: true,
      render: (r) =>
        r.inputVat !== 0
          ? <Badge className="bg-status-info-surface text-status-info-foreground">
              {formatCurrency(r.inputVat)}
            </Badge>
          : "—",
    },
    {
      key: "netVat",
      header: "الصافي",
      sortable: true,
      className: "font-bold",
      render: (r) => (
        <span className={r.netVat >= 0 ? "text-emerald-700" : "text-destructive"}>
          {formatCurrency(r.netVat)}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title="مطابقة ضريبة القيمة المضافة"
      subtitle="مقارنة حركة الفترة على حسابي ضريبة المخرجات / المدخلات مقابل الرصيد الفعلي قبل تقديم إقرار زاتكا الشهري"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "مطابقة الضريبة" },
      ]}
      actions={
        <>
          <DatePicker value={startDate} onChange={setStartDate} className="w-44" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-44" placeholder="إلى" />
          <GuardedButton
            perm="finance:export"
            variant="outline"
            size="sm"
            onClick={() => exportCSV(bySource, `vat-reconciliation-${startDate}-${endDate}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_vat_reconciliation"
            entityId={`${startDate}..${endDate}`}
            payload={{
              entity: {
                title: "تسوية ضريبة القيمة المضافة (VAT)",
                startDate, endDate,
                summary,
              },
              items: bySource,
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />
      {/* الرسالة الرئيسية: drift صفر أم لا */}
      <Card className={summary.driftIsClean
        ? "border-emerald-300 bg-emerald-50/40"
        : "border-status-warning-surface bg-status-warning-surface/40"}>
        <CardContent className="p-4 flex items-start gap-3">
          {summary.driftIsClean
            ? <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-status-warning-foreground mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">
              {summary.driftIsClean
                ? "الأرصدة متطابقة — جاهز للإقرار"
                : `يوجد فرق ${formatCurrency(Math.abs(summary.drift))} يجب مراجعته قبل الإقرار`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.driftIsClean
                ? `صافي الضريبة المستحقة لزاتكا للفترة = ${formatCurrency(summary.netVatDue)}`
                : "الفرق بين رصيد الحسابات الدفتري والمحسوب من قيود الفترة قد يعني قيداً يدوياً على حساب الضريبة من مصدر غير معتاد، أو قيداً وقع خارج حدود الفترة."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              حسابات الضريبة المستخدمة: المخرجات <span className="font-mono">{accounts.outputVatCode}</span> · المدخلات <span className="font-mono">{accounts.inputVatCode}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* بطاقات الـ KPI */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mt-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ضريبة المخرجات (الفترة)</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.outputVatPeriod)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ضريبة المدخلات (الفترة)</p>
            <p className="text-xl font-bold text-status-info-foreground mt-1">
              {formatCurrency(summary.inputVatPeriod)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">صافي المستحق لزاتكا (الفترة)</p>
            <p className="text-xl font-bold text-orange-600 mt-1">
              {formatCurrency(summary.netVatDue)}
            </p>
          </CardContent>
        </Card>
        <Card className={summary.driftIsClean ? "" : "border-amber-400"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3" />
              الفرق مع الرصيد الفعلي
            </p>
            <p className={`text-xl font-bold mt-1 ${summary.driftIsClean ? "text-emerald-700" : "text-status-warning-foreground"}`}>
              {formatCurrency(summary.drift)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* بطاقات الأرصدة الفعلية */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3 mt-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">رصيد المخرجات الفعلي (منذ البداية)</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.outputVatLiveBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">رصيد المدخلات الفعلي (منذ البداية)</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.inputVatLiveBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">صافي رصيد المستحق الفعلي</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.liveNetPayable)}</p>
          </CardContent>
        </Card>
      </div>

      {/* تفصيل المصادر */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">تفصيل حركة الفترة حسب المصدر</h3>
        <DataTable
          columns={columns}
          data={bySource}
          emptyMessage="لا توجد حركة على حسابات الضريبة في هذه الفترة"
          noToolbar
        />
      </div>

      {/* سياسة التسوية — قياسية قابلة للتعديل من الواجهة */}
      <SettlementPolicyCard />

      {/* ترحيل تسوية الفترة — معاينة + ترحيل بشري للدفتر */}
      <SettlementPostPanel />
    </PageShell>
  );
}
