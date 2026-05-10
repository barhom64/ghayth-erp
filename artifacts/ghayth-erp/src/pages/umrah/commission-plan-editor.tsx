import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Trash2, Calculator, ArrowRight } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency } from "@/lib/formatters";

type PlanForm = {
  id?: number;
  employeeId?: number;
  assignmentId?: number | null;
  seasonId?: number | null;
  planName?: string;
  baseSalary?: number;
  commissionType?: "percentage" | "fixed" | "tiered" | "mixed";
  conditionType?: "profit_avg" | "sales_percent" | "both_or" | "none";
  minProfitPerVisa?: number | null;
  minSalesPercent?: number | null;
  minAvgPrice?: number | null;
  excludedMonths?: number[];
  tierUnit?: number;
  partialTiersAllowed?: boolean;
  violationBlocksCommission?: boolean;
  status?: "active" | "suspended" | "expired";
  notes?: string | null;
};

type Tier = {
  id?: number;
  fromCount: number;
  toCount: number | null;
  bonusPerUnit: number;
  isCumulative: boolean;
};

type SimulateResult = {
  conditionMet: boolean;
  conditionDetails: string;
  isExcludedMonth: boolean;
  hasViolations: boolean;
  completedTiers: number;
  tierBreakdown: { from: number; to: number | null; units: number; perUnit: number; subtotal: number }[];
  commissionAmount: number;
  finalAmount: number;
  payrollTotal: number;
};

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

export default function UmrahCommissionPlanEditor() {
  const [match, params] = useRoute("/umrah/commission-plans/:id");
  const [, setLocation] = useLocation();
  const isNew = !match || params?.id === "new";
  const planId = isNew ? null : Number(params!.id);
  const { toast } = useToast();

  const [form, setForm] = useState<PlanForm>({
    commissionType: "tiered",
    conditionType: "both_or",
    tierUnit: 10000,
    excludedMonths: [11, 12],
    partialTiersAllowed: false,
    violationBlocksCommission: true,
    status: "active",
  });
  const [tiers, setTiers] = useState<Tier[]>([
    { fromCount: 0, toCount: 50000, bonusPerUnit: 500, isCumulative: true },
  ]);

  const { data: planResp, isLoading } = useApiQuery<any>(
    ["umrah-plan", String(planId ?? "new")],
    planId ? `/umrah/commission-plans/${planId}` : null
  );
  useEffect(() => {
    if (planResp) {
      setForm({
        ...planResp,
        baseSalary: Number(planResp.baseSalary),
        minProfitPerVisa: planResp.minProfitPerVisa === null ? null : Number(planResp.minProfitPerVisa),
        minSalesPercent: planResp.minSalesPercent === null ? null : Number(planResp.minSalesPercent),
        minAvgPrice: planResp.minAvgPrice === null ? null : Number(planResp.minAvgPrice),
      });
      if (Array.isArray(planResp.tiers)) {
        setTiers(planResp.tiers.map((t: any) => ({
          id: t.id,
          fromCount: Number(t.fromCount),
          toCount: t.toCount === null ? null : Number(t.toCount),
          bonusPerUnit: Number(t.bonusPerUnit),
          isCumulative: !!t.isCumulative,
        })));
      }
    }
  }, [planResp]);

  const { data: employeesResp } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees?limit=500");
  const employees = employeesResp?.data ?? [];

  const createPlan = useApiMutation<{ id: number }, PlanForm>(
    "/umrah/commission-plans", "POST", [["umrah-commission-plans"]],
    { successMessage: "تم إنشاء الخطة" }
  );
  const updatePlan = useApiMutation<{ id: number }, PlanForm & { id: number }>(
    (b) => `/umrah/commission-plans/${b.id}`, "PATCH", [["umrah-commission-plans"]],
    { successMessage: "تم تحديث الخطة" }
  );

  // Simulation
  const [simInput, setSimInput] = useState({
    totalMutamers: 37000, avgProfitPerVisa: 28, salesPercent: 22, avgSalePrice: 155,
    isExcludedMonth: false, hasViolations: false,
  });
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  const runSimulation = async () => {
    if (!planId) {
      toast({ variant: "destructive", title: "احفظ الخطة أولاً قبل المحاكاة" });
      return;
    }
    setSimulating(true);
    try {
      const r = await apiFetch(`/umrah/commission-plans/${planId}/simulate`, {
        method: "POST",
        body: JSON.stringify(simInput),
      });
      setSimResult(r as SimulateResult);
    } catch {
      toast({ variant: "destructive", title: "فشلت المحاكاة" });
    } finally {
      setSimulating(false);
    }
  };

  const savePlan = async () => {
    if (!form.employeeId || !form.planName?.trim() || form.baseSalary == null) {
      toast({ variant: "destructive", title: "الحقول الإلزامية ناقصة" });
      return;
    }
    if (planId) {
      updatePlan.mutate({ ...form, id: planId } as any, {
        onSuccess: () => syncTiers(planId),
      });
    } else {
      createPlan.mutate(form, {
        onSuccess: (data: any) => {
          toast({ title: "تم إنشاء الخطة" });
          syncTiers(data.id);
          setLocation(`/umrah/commission-plans/${data.id}`);
        },
      });
    }
  };

  const syncTiers = async (id: number) => {
    // Naïve implementation: delete existing tiers, recreate. The route layer
    // handles soft-delete + RBAC. Production refinement could diff them.
    if (planResp?.tiers) {
      for (const old of planResp.tiers) {
        if (!tiers.find((t) => t.id === old.id)) {
          await apiFetch(`/umrah/commission-plans/${id}/tiers/${old.id}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }
    for (const t of tiers) {
      if (t.id) {
        await apiFetch(`/umrah/commission-plans/${id}/tiers/${t.id}`, {
          method: "PATCH", body: JSON.stringify(t),
        }).catch(() => {});
      } else {
        await apiFetch(`/umrah/commission-plans/${id}/tiers`, {
          method: "POST", body: JSON.stringify(t),
        }).catch(() => {});
      }
    }
    toast({ title: "تم حفظ الشرائح" });
  };

  const toggleExcluded = (m: number) => {
    const cur = form.excludedMonths ?? [];
    setForm({
      ...form,
      excludedMonths: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
    });
  };

  if (planId && isLoading) return <LoadingSpinner />;

  return (
    <PageShell
      title={planId ? `تعديل خطة العمولة #${planId}` : "خطة عمولة جديدة"}
      breadcrumbs={[{ label: "العمرة" }, { label: "العمولات", href: "/umrah/commission-plans" }, { label: planId ? "تعديل" : "جديدة" }]}
    >
      <UmrahTabsNav />

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => setLocation("/umrah/commission-plans")} className="gap-2">
          <ArrowRight className="h-4 w-4" />رجوع للقائمة
        </Button>
        <Button onClick={savePlan} disabled={createPlan.isPending || updatePlan.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {planId ? "تحديث الخطة" : "إنشاء الخطة"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Plan details card */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>بيانات الخطة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>اسم الخطة *</Label>
              <Input value={form.planName ?? ""} onChange={(e) => setForm({ ...form, planName: e.target.value })} />
            </div>
            <div>
              <Label>الموظف *</Label>
              <select className="w-full border rounded-md p-2"
                value={form.employeeId ?? ""}
                onChange={(e) => setForm({ ...form, employeeId: Number(e.target.value) })}
              >
                <option value="">— اختر الموظف —</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>الراتب الأساسي *</Label>
              <Input type="number" value={form.baseSalary ?? ""}
                onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>وحدة الشريحة (معتمر)</Label>
              <Input type="number" value={form.tierUnit ?? 10000}
                onChange={(e) => setForm({ ...form, tierUnit: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>نوع العمولة</Label>
              <select className="w-full border rounded-md p-2"
                value={form.commissionType ?? "tiered"}
                onChange={(e) => setForm({ ...form, commissionType: e.target.value as any })}
              >
                <option value="tiered">شرائح</option>
                <option value="percentage">نسبة من المبيعات</option>
                <option value="fixed">مبلغ ثابت</option>
                <option value="mixed">مزيج</option>
              </select>
            </div>
            <div>
              <Label>نوع الشرط</Label>
              <select className="w-full border rounded-md p-2"
                value={form.conditionType ?? "none"}
                onChange={(e) => setForm({ ...form, conditionType: e.target.value as any })}
              >
                <option value="none">بدون شرط</option>
                <option value="profit_avg">متوسط ربح التأشيرة</option>
                <option value="sales_percent">نسبة المبيعات + متوسط السعر</option>
                <option value="both_or">أيهما تحقق</option>
              </select>
            </div>
            <div>
              <Label>أدنى ربح للتأشيرة (ريال)</Label>
              <Input type="number" value={form.minProfitPerVisa ?? ""}
                onChange={(e) => setForm({ ...form, minProfitPerVisa: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <Label>أدنى نسبة مبيعات (%)</Label>
              <Input type="number" value={form.minSalesPercent ?? ""}
                onChange={(e) => setForm({ ...form, minSalesPercent: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <Label>أدنى متوسط سعر</Label>
              <Input type="number" value={form.minAvgPrice ?? ""}
                onChange={(e) => setForm({ ...form, minAvgPrice: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <Label>الحالة</Label>
              <select className="w-full border rounded-md p-2"
                value={form.status ?? "active"}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              >
                <option value="active">نشطة</option>
                <option value="suspended">موقوفة</option>
                <option value="expired">منتهية</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <Checkbox checked={!!form.partialTiersAllowed}
                  onCheckedChange={(v) => setForm({ ...form, partialTiersAllowed: !!v })}
                />
                <span className="text-sm">السماح بشرائح جزئية</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={!!form.violationBlocksCommission}
                  onCheckedChange={(v) => setForm({ ...form, violationBlocksCommission: !!v })}
                />
                <span className="text-sm">المخالفات توقف العمولة</span>
              </label>
            </div>
            <div className="col-span-2">
              <Label>الأشهر الهجرية المستثناة</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {HIJRI_MONTHS.map((name, idx) => {
                  const m = idx + 1;
                  const active = form.excludedMonths?.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleExcluded(m)}
                      className={`text-xs border rounded px-2 py-1 ${
                        active ? "bg-orange-100 border-orange-400 text-orange-800" : "bg-white"
                      }`}
                    >
                      {m}. {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Simulator card */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />محاكاة العمولة
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>عدد المعتمرين</Label>
              <Input type="number" value={simInput.totalMutamers}
                onChange={(e) => setSimInput({ ...simInput, totalMutamers: Number(e.target.value) })} />
            </div>
            <div>
              <Label>متوسط ربح التأشيرة (ر.س)</Label>
              <Input type="number" value={simInput.avgProfitPerVisa}
                onChange={(e) => setSimInput({ ...simInput, avgProfitPerVisa: Number(e.target.value) })} />
            </div>
            <div>
              <Label>نسبة المبيعات (%)</Label>
              <Input type="number" value={simInput.salesPercent}
                onChange={(e) => setSimInput({ ...simInput, salesPercent: Number(e.target.value) })} />
            </div>
            <div>
              <Label>متوسط سعر البيع (ر.س)</Label>
              <Input type="number" value={simInput.avgSalePrice}
                onChange={(e) => setSimInput({ ...simInput, avgSalePrice: Number(e.target.value) })} />
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1">
                <Checkbox checked={simInput.isExcludedMonth}
                  onCheckedChange={(v) => setSimInput({ ...simInput, isExcludedMonth: !!v })} />
                شهر مستثنى
              </label>
              <label className="flex items-center gap-1">
                <Checkbox checked={simInput.hasViolations}
                  onCheckedChange={(v) => setSimInput({ ...simInput, hasViolations: !!v })} />
                توجد مخالفات
              </label>
            </div>
            <Button onClick={runSimulation} disabled={simulating || !planId} className="w-full">
              {simulating ? "جاري الحساب..." : "احسب"}
            </Button>
            {!planId && <p className="text-xs text-muted-foreground">احفظ الخطة لتفعيل المحاكاة</p>}
            {simResult && (
              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>الشروط</span>
                  <span className={simResult.conditionMet ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    {simResult.conditionMet ? "تحققت" : "لم تتحقق"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{simResult.conditionDetails}</div>
                <div className="flex justify-between">
                  <span>الشرائح المكتملة</span>
                  <span className="font-medium">{simResult.completedTiers}</span>
                </div>
                <div className="flex justify-between">
                  <span>مبلغ العمولة</span>
                  <span className="font-medium">{formatCurrency(simResult.commissionAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-bold">المبلغ النهائي</span>
                  <span className="font-bold text-primary">{formatCurrency(simResult.finalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>إجمالي الراتب</span>
                  <span className="font-bold text-green-600">{formatCurrency(simResult.payrollTotal)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tiers card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>الشرائح التصاعدية</CardTitle>
          <Button size="sm" onClick={() => setTiers([
            ...tiers,
            { fromCount: tiers.length === 0 ? 0 : (tiers[tiers.length - 1].toCount ?? 0) + 1,
              toCount: null, bonusPerUnit: 0, isCumulative: true },
          ])} className="gap-1">
            <Plus className="h-4 w-4" />إضافة شريحة
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-right">من</th>
                <th className="p-2 text-right">إلى (فارغ = ∞)</th>
                <th className="p-2 text-right">المبلغ لكل وحدة</th>
                <th className="p-2 text-center">تراكمية</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-2">
                    <Input type="number" value={t.fromCount}
                      onChange={(e) => {
                        const v = [...tiers]; v[idx] = { ...t, fromCount: Number(e.target.value) }; setTiers(v);
                      }} />
                  </td>
                  <td className="p-2">
                    <Input type="number" value={t.toCount ?? ""}
                      onChange={(e) => {
                        const v = [...tiers];
                        v[idx] = { ...t, toCount: e.target.value ? Number(e.target.value) : null };
                        setTiers(v);
                      }} />
                  </td>
                  <td className="p-2">
                    <Input type="number" step="0.01" value={t.bonusPerUnit}
                      onChange={(e) => {
                        const v = [...tiers]; v[idx] = { ...t, bonusPerUnit: Number(e.target.value) }; setTiers(v);
                      }} />
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox checked={t.isCumulative}
                      onCheckedChange={(c) => {
                        const v = [...tiers]; v[idx] = { ...t, isCumulative: !!c }; setTiers(v);
                      }} />
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
              {tiers.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-sm">
                  لا توجد شرائح بعد — أضف شريحة لتبدأ
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">
            ملاحظة: الشرائح تُحفظ مع زر "تحديث الخطة" أعلاه. المحاكاة تستخدم الشرائح المحفوظة في قاعدة البيانات.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
