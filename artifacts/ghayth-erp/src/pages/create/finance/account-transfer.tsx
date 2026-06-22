import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { CreatePageLayout } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuardedButton } from "@/components/shared/permission-gate";
import { AccountSelect } from "@/components/shared/entity-selects";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRightLeft, CheckCircle2, AlertCircle, Banknote, ArrowDown,
} from "lucide-react";

/**
 * Inter-Account Transfer Wizard
 *
 * Common daily operation: move money between cash boxes / bank accounts.
 * Currently the accountant has to build a manual JE: DR target / CR source.
 * This wizard does it safely with:
 *  - Pre-flight: both accounts allow posting + balance check on source
 *  - Single-amount input
 *  - Optional fee (with auto-route to bank charges expense)
 *  - JE preview before posting
 *  - One-click submit via /finance/journal
 */

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  nature?: string;
  currentBalance?: number | string;
  allowPosting?: boolean;
  level?: number;
}

export default function AccountTransferPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: accountsResp, isLoading: accLoading } = useApiQuery<{ data: Account[] }>(
    ["cash-bank-accounts"], `/finance/accounts?limit=500`,
  );

  // Only cash & bank accounts (codes 11x), allowPosting
  const cashAccounts = useMemo(() => {
    const all = accountsResp?.data ?? [];
    return all
      .filter((a) => a.allowPosting && a.code && a.code.startsWith("11"))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accountsResp]);

  const [form, setForm] = useState({
    date: todayLocal(),
    sourceAccountCode: "",
    targetAccountCode: "",
    amount: "" as number | string,
    fee: "" as number | string,
    feeAccountCode: "5510",        // مصاريف بنكية default
    reference: "",
    notes: "",
  });

  const sourceAccount = cashAccounts.find((a) => a.code === form.sourceAccountCode);
  const targetAccount = cashAccounts.find((a) => a.code === form.targetAccountCode);
  const sourceBalance = Number(sourceAccount?.currentBalance ?? 0);
  const transferAmount = Number(form.amount) || 0;
  const feeAmount = Number(form.fee) || 0;
  const totalDebit = transferAmount;
  const sourceAfter = sourceBalance - (transferAmount + feeAmount);
  const sourceWillBeNegative = sourceAfter < 0 && sourceBalance > 0;

  const journalMut = useApiMutation("/finance/journal", "POST", [["journal"]]);

  const validate = (): string | null => {
    if (!form.sourceAccountCode) return "اختر الحساب المصدر";
    if (!form.targetAccountCode) return "اختر الحساب الهدف";
    if (form.sourceAccountCode === form.targetAccountCode) return "الحساب المصدر والهدف لا يمكن أن يكونا نفس الحساب";
    if (transferAmount <= 0) return "المبلغ يجب أن يكون أكبر من صفر";
    if (feeAmount > 0 && !form.feeAccountCode) return "اختر حساب رسوم البنك";
    return null;
  };

  const buildJournalLines = () => {
    const lines: any[] = [];
    const desc = form.notes || `تحويل من ${sourceAccount?.name ?? form.sourceAccountCode} إلى ${targetAccount?.name ?? form.targetAccountCode}`;

    // DR target (receiver gets the money)
    lines.push({
      accountCode: form.targetAccountCode,
      debit: transferAmount,
      credit: 0,
      description: `استلام تحويل — ${form.reference || form.targetAccountCode}`,
    });

    // CR source (sender loses the money + fee)
    lines.push({
      accountCode: form.sourceAccountCode,
      debit: 0,
      credit: transferAmount + feeAmount,
      description: `إرسال تحويل — ${form.reference || form.sourceAccountCode}`,
    });

    // If fee, DR bank charges expense
    if (feeAmount > 0) {
      lines.push({
        accountCode: form.feeAccountCode,
        debit: feeAmount,
        credit: 0,
        description: `رسوم بنكية على التحويل — ${form.reference || ""}`,
      });
    }

    return { lines, description: desc };
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    if (sourceWillBeNegative) {
      const proceed = confirm(`تحذير: الرصيد سيصبح سالباً ${formatCurrency(sourceAfter)}. هل تريد المتابعة؟`);
      if (!proceed) return;
    }
    try {
      const { lines, description } = buildJournalLines();
      await journalMut.mutateAsync({
        ref: form.reference || `TRF-${form.date}-${Date.now().toString(36).slice(-4)}`,
        date: form.date,
        description,
        lines,
      });
      toast({
        title: "تم التحويل",
        description: `${formatCurrency(transferAmount)} من ${sourceAccount?.name} إلى ${targetAccount?.name}`,
      });
      setLocation("/finance/treasury");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التحويل", description: getErrorMessage(e) });
    }
  };

  if (accLoading) return null;

  return (
    <CreatePageLayout title="تحويل بين الحسابات" backPath="/finance/treasury">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> تحويل آمن بين الحسابات النقدية
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            تحويل بين بنوك / صناديق / محافظ. الـ wizard يُولّد قيد JE متوازن
            تلقائياً: <strong>مدين الحساب الهدف</strong> + <strong>دائن الحساب المصدر</strong>
            + (إن وُجدت رسوم) <strong>مدين حساب الرسوم البنكية</strong>. مع فحص رصيد
            مسبق لتجنّب overdraft غير متعمد.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات التحويل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">التاريخ *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">مرجع التحويل (اختياري)</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="مثال: SADAD-2026-001 أو SWIFT/IBAN" className="h-9" />
            </div>
          </div>

          {/* Visual: source → target */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div className="p-4 rounded-lg border-2 border-red-200 bg-red-50/40">
              <p className="text-xs font-semibold mb-2 text-red-800 flex items-center gap-2">
                <Banknote className="h-4 w-4" /> من حساب (Source)
              </p>
              <AccountSelect
                value={form.sourceAccountCode}
                onChange={(v) => setForm({ ...form, sourceAccountCode: String(v ?? "") })}
                label=""
              />
              {sourceAccount && (
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الرصيد الحالي:</span>
                    <span className="font-mono font-bold">{formatCurrency(sourceBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">سيُخصم:</span>
                    <span className="font-mono text-red-700">-{formatCurrency(transferAmount + feeAmount)}</span>
                  </div>
                  <div className={`flex justify-between pt-1 border-t ${sourceWillBeNegative ? "text-red-700 font-bold" : ""}`}>
                    <span className="text-muted-foreground">الرصيد بعد التحويل:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(sourceAfter)}
                      {sourceWillBeNegative && <AlertCircle className="inline h-3 w-3 ms-1" />}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg border-2 border-emerald-200 bg-emerald-50/40">
              <p className="text-xs font-semibold mb-2 text-emerald-800 flex items-center gap-2">
                <Banknote className="h-4 w-4" /> إلى حساب (Target)
              </p>
              <AccountSelect
                value={form.targetAccountCode}
                onChange={(v) => setForm({ ...form, targetAccountCode: String(v ?? "") })}
                label=""
              />
              {targetAccount && (
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الرصيد الحالي:</span>
                    <span className="font-mono font-bold">{formatCurrency(Number(targetAccount.currentBalance ?? 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">سيُضاف:</span>
                    <span className="font-mono text-emerald-700">+{formatCurrency(transferAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t">
                    <span className="text-muted-foreground">الرصيد بعد التحويل:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatCurrency(Number(targetAccount.currentBalance ?? 0) + transferAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-6 w-6 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">المبلغ المحوّل *</Label>
              <Input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00" className="h-9 font-mono text-lg" />
            </div>
            <div>
              <Label className="text-xs">رسوم بنكية (اختياري)</Label>
              <Input type="number" step="0.01" value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                placeholder="0" className="h-9 font-mono" />
            </div>
          </div>

          {feeAmount > 0 && (
            <div>
              <Label className="text-xs">حساب الرسوم البنكية</Label>
              <AccountSelect
                value={form.feeAccountCode}
                onChange={(v) => setForm({ ...form, feeAccountCode: String(v ?? "") })}
                label=""
              />
              <p className="text-[10px] text-muted-foreground mt-1">افتراضي: 5510 — مصاريف بنكية</p>
            </div>
          )}

          <div>
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="مثال: تحويل للصرف على رواتب الموظفين" />
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {sourceWillBeNegative && (
        <Card className="mb-4 border-red-400 bg-red-50/40">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-red-900">
            <AlertCircle className="h-5 w-5" />
            <span>
              <strong>تحذير:</strong> الرصيد في الحساب المصدر سيصبح سالباً ({formatCurrency(sourceAfter)})
              بعد التحويل. تأكد قبل المتابعة.
            </span>
          </CardContent>
        </Card>
      )}

      {/* JE Preview */}
      {transferAmount > 0 && form.sourceAccountCode && form.targetAccountCode && (
        <Card className="mb-4 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" /> معاينة القيد المحاسبي
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <DataTable<{ accountCode: string; debit: number; credit: number; description: string }>
              noToolbar
              pageSize={0}
              className="text-xs"
              data={buildJournalLines().lines}
              rowKey={(_jl, i) => i}
              columns={[
                {
                  key: "accountCode", header: "الحساب", align: "end",
                  render: (jl) => <span className="font-mono">{jl.accountCode}</span>,
                },
                {
                  key: "description", header: "الوصف", align: "end",
                  render: (jl) => <span className="text-muted-foreground">{jl.description}</span>,
                },
                {
                  key: "debit", header: "مدين", align: "end",
                  render: (jl) => (
                    <span className="font-mono text-emerald-700">
                      {Number(jl.debit) > 0 ? formatCurrency(Number(jl.debit)) : "—"}
                    </span>
                  ),
                },
                {
                  key: "credit", header: "دائن", align: "end",
                  render: (jl) => (
                    <span className="font-mono text-red-700">
                      {Number(jl.credit) > 0 ? formatCurrency(Number(jl.credit)) : "—"}
                    </span>
                  ),
                },
              ] satisfies DataTableColumn<{ accountCode: string; debit: number; credit: number; description: string }>[]}
              renderGrandTotal={() => (
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={2} className="p-1 text-end">الإجمالي</td>
                  <td className="p-1 font-mono text-end text-emerald-700">
                    {formatCurrency(totalDebit + feeAmount)}
                  </td>
                  <td className="p-1 font-mono text-end text-red-700">
                    {formatCurrency(transferAmount + feeAmount)}
                  </td>
                </tr>
              )}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/finance/treasury")}>إلغاء</Button>
        <GuardedButton
          perm="finance:create"
          onClick={handleSubmit}
          disabled={journalMut.isPending || transferAmount === 0 || !form.sourceAccountCode || !form.targetAccountCode}
          rateLimitAware
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {journalMut.isPending
            ? "جاري التحويل..."
            : <><ArrowRightLeft className="h-4 w-4 me-1" /> تنفيذ التحويل</>}
        </GuardedButton>
      </div>

      {cashAccounts.length === 0 && (
        <Card className="mt-3 border-amber-300 bg-amber-50/30">
          <CardContent className="p-3 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            ما في حسابات نقدية/بنكية مفعّلة. أضف حساب من /finance/accounts برمز يبدأ بـ 11x.
          </CardContent>
        </Card>
      )}
    </CreatePageLayout>
  );
}
