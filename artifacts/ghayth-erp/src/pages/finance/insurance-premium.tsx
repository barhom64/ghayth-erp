import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageShell } from "@workspace/ui-core";
import { ShieldCheck, Info, ChevronDown } from "lucide-react";

/**
 * تسجيل قسط تأمين (finance-insurance.ts).
 *
 * The insurance engine OPENS a prepaid premium + its amortization schedule but
 * had no page. This form posts the generic endpoint (kind in body), which the
 * engine books as a prepaid asset that then amortizes month-by-month — visible
 * afterwards in «إطفاء المصروفات المقدمة».
 *
 *   POST /finance/insurance/premium  → { data } (201)
 *
 * Account purposes are resolved by the financial engine. The defaults below are
 * the valid mappings for insurance (verified against the MAPPING registry):
 *   prepaid  → fleet_prepaid_insurance   (asset: تأمينات مدفوعة مقدم)
 *   expense  → general_expense           (expense)
 *   source   → fleet_cash_source         (asset, when paid)
 */

const KIND_ENTITY: Record<string, { entityType: string; idLabel: string }> = {
  property: { entityType: "property", idLabel: "معرّف العقار / الوحدة" },
  medical:  { entityType: "employee", idLabel: "معرّف الموظف" },
};

export default function InsurancePremiumPage() {
  const [, navigate] = useLocation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    kind: "property",
    insuredEntityId: "",
    premiumAmount: "",
    startDate: "",
    endDate: "",
    policyNumber: "",
    vendorId: "",
    paid: false,
    prepaidAccountPurpose: "fleet_prepaid_insurance",
    expenseAccountPurpose: "general_expense",
    sourceAccountPurpose: "fleet_cash_source",
  });

  const createMut = useApiMutation<{ data: unknown }, Record<string, unknown>>(
    "/finance/insurance/premium",
    "POST",
    [["amortization"]],
    { successMessage: "تم فتح قسط التأمين وإنشاء جدول إطفائه" },
  );

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const valid =
    Number(form.insuredEntityId) > 0 &&
    Number(form.premiumAmount) > 0 &&
    form.startDate.length >= 8 &&
    form.endDate.length >= 8 &&
    form.endDate > form.startDate;

  const submit = () => {
    const body: Record<string, unknown> = {
      kind: form.kind,
      insuredEntityType: KIND_ENTITY[form.kind].entityType,
      insuredEntityId: Number(form.insuredEntityId),
      premiumAmount: Number(form.premiumAmount),
      startDate: form.startDate,
      endDate: form.endDate,
      prepaidAccountPurpose: form.prepaidAccountPurpose.trim() || "fleet_prepaid_insurance",
      expenseAccountPurpose: form.expenseAccountPurpose.trim() || "general_expense",
    };
    if (form.policyNumber.trim()) body.policyNumber = form.policyNumber.trim();
    if (Number(form.vendorId) > 0) body.vendorId = Number(form.vendorId);
    if (form.paid) {
      body.paid = true;
      if (form.sourceAccountPurpose.trim()) body.sourceAccountPurpose = form.sourceAccountPurpose.trim();
    }
    createMut.mutate(body, {
      onSuccess: () => navigate("/finance/amortization"),
    });
  };

  return (
    <PageShell
      title="تسجيل قسط تأمين"
      subtitle="يفتح قسطاً مدفوعاً مقدماً وينشئ جدول إطفائه تلقائياً — يظهر بعدها في «إطفاء المصروفات المقدمة»"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تسجيل قسط تأمين" }]}
    >
      <FinanceTabsNav />

      <div className="rounded-lg border bg-blue-50/50 border-blue-100 p-3 flex items-start gap-2 text-sm text-blue-900">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>القسط يُجمَّع كأصل مدفوع مقدماً ثم يُطفأ شهرياً على مدة التغطية. تابع الإطفاء من صفحة المصروفات المقدمة بعد الحفظ.</span>
      </div>

      <Card className="mt-3 max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> بيانات القسط
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع التأمين</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="property">تأمين عقاري</SelectItem>
                  <SelectItem value="medical">تأمين طبي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{KIND_ENTITY[form.kind].idLabel}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.insuredEntityId}
                onChange={(e) => set("insuredEntityId", e.target.value)}
                placeholder="رقم الجهة المؤمّنة"
              />
            </div>
            <div className="space-y-1.5">
              <Label>قيمة القسط</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.premiumAmount}
                onChange={(e) => set("premiumAmount", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>رقم الوثيقة (اختياري)</Label>
              <Input value={form.policyNumber} onChange={(e) => set("policyNumber", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>بداية التغطية</Label>
              <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>نهاية التغطية</Label>
              <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>معرّف المورّد (اختياري)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.vendorId}
                onChange={(e) => set("vendorId", e.target.value)}
                placeholder="جهة التأمين"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="paid" checked={form.paid} onCheckedChange={(c) => set("paid", c === true)} />
              <Label htmlFor="paid" className="cursor-pointer">مدفوع نقداً الآن</Label>
            </div>
          </div>

          {/* Advanced — account-purpose overrides (sensible insurance defaults). */}
          <div className="border-t pt-3">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAdvanced((s) => !s)}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              إعدادات الحسابات (متقدّم)
            </button>
            {showAdvanced && (
              <div className="grid gap-4 md:grid-cols-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">غرض الأصل المقدّم</Label>
                  <Input value={form.prepaidAccountPurpose} onChange={(e) => set("prepaidAccountPurpose", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">غرض المصروف</Label>
                  <Input value={form.expenseAccountPurpose} onChange={(e) => set("expenseAccountPurpose", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">غرض مصدر النقد</Label>
                  <Input
                    value={form.sourceAccountPurpose}
                    onChange={(e) => set("sourceAccountPurpose", e.target.value)}
                    disabled={!form.paid}
                  />
                </div>
              </div>
            )}
          </div>

          {createMut.isError && (
            <p className="text-sm text-destructive">{getErrorMessage(createMut.error)}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <GuardedButton
              perm="finance:create"
              onClick={submit}
              disabled={!valid || createMut.isPending}
            >
              {createMut.isPending ? "جارٍ الحفظ..." : "فتح القسط"}
            </GuardedButton>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
