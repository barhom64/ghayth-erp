import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { ArrowRight, Plus, Save, Trash2, Play, Calculator, AlertCircle } from "lucide-react";
import {
  FormShell,
  FormNumberField,
  FormGrid,
} from "@/components/form-shell";

// Simulator schema. The bigger `plan` editor (with tiers,
// excludedMonths, conditions, etc.) is intentionally left on
// useState — it's a multi-section form whose deepest layer
// (TiersEditor) deserves its own batch.
const simSchema = z.object({
  totalMutamers: z.coerce.number().int().nonnegative(),
  avgProfitPerVisa: z.coerce.number().nonnegative(),
  salesPercent: z.coerce.number().min(0).max(100),
  avgSalePrice: z.coerce.number().nonnegative(),
});
type SimForm = z.infer<typeof simSchema>;

type CommissionType = "percentage" | "fixed" | "tiered" | "mixed";
type ConditionType = "profit_avg" | "sales_percent" | "both_or" | "none";

interface Tier {
  id?: number;
  fromCount: number;
  toCount: number | null;
  bonusPerUnit: number;
  isCumulative: boolean;
  tierOrder: number;
}

interface CommissionPlan {
  id?: number;
  employeeId?: number;
  assignmentId?: number;
  seasonId?: number;
  planName?: string;
  baseSalary?: number;
  commissionType?: CommissionType;
  percentageRate?: number;
  fixedAmount?: number;
  conditionType?: ConditionType;
  minProfitPerVisa?: number;
  minSalesPercent?: number;
  minAvgPrice?: number;
  tiers?: Tier[];
  excludedMonths?: number[];
  notes?: string;
}

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الثاني",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

const emptyTier = (order: number): Tier => ({
  fromCount: 0, toCount: null, bonusPerUnit: 0, isCumulative: false, tierOrder: order,
});

export default function UmrahCommissionPlanEditor() {
  const [, setLocation] = useLocation();
  const [, editParams] = useRoute<{ id: string }>("/umrah/commission-plans/:id/edit");
  const isEditMode = !!editParams?.id;
  const planId = editParams?.id;

  const { toast } = useToast();
  const [tab, setTab] = useState("basic");
  const [plan, setPlan] = useState<CommissionPlan>({
    commissionType: "tiered",
    conditionType: "none",
    tiers: [emptyTier(1)],
    excludedMonths: [],
    baseSalary: 0,
  });


  const loadQ = useApiQuery<{ data: CommissionPlan }>(
    ["umrah-commission-plan", planId ?? ""],
    isEditMode && planId ? `/umrah/commission-plans/${planId}` : null,
  );

  const employeesQ = useApiQuery<{ data: any[] }>(["employees"], "/employees");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");

  const assignmentsQ = useApiQuery<{ data: any[] }>(
    ["umrah-employee-assignments", String(plan.employeeId ?? "")],
    plan.employeeId ? `/umrah/employees/${plan.employeeId}/assignments` : null,
  );

  useEffect(() => {
    if (isEditMode && loadQ.data?.data) {
      const loaded = loadQ.data.data;
      setPlan({
        ...loaded,
        tiers: loaded.tiers?.length ? loaded.tiers : [emptyTier(1)],
        excludedMonths: loaded.excludedMonths ?? [],
      });
    }
  }, [isEditMode, loadQ.data]);

  const saveMut = useApiMutation<any, CommissionPlan>(
    (body) => (body.id ? `/umrah/commission-plans/${body.id}` : "/umrah/commission-plans"),
    isEditMode ? "PATCH" : "POST",
    [["umrah-commission-plans"]],
    {
      successMessage: isEditMode ? "تم تحديث الخطة" : "تم إنشاء الخطة",
      onSuccess: (res: any) => {
        if (!isEditMode && res?.data?.id) {
          setLocation(`/umrah/commission-plans/${res.data.id}/edit`);
        }
      },
    },
  );

  // Simulator state — only `simResult` and `simBusy` stay as
  // useState. The four input fields are managed by FormShell below
  // via the SimulatorPanel subcomponent.
  const [simResult, setSimResult] = useState<any>(null);
  const [simBusy, setSimBusy] = useState(false);

  const runSim = async (values: SimForm) => {
    if (!plan.id) {
      toast({ variant: "destructive", title: "يرجى حفظ الخطة أولاً قبل التشغيل التجريبي" });
      return;
    }
    setSimBusy(true);
    try {
      const res: any = await apiFetch(`/umrah/commission-plans/${plan.id}/simulate`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setSimResult(res?.data ?? res);
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "تعذّر التشغيل التجريبي" });
    } finally {
      setSimBusy(false);
    }
  };

  const updateTier = (idx: number, patch: Partial<Tier>) => {
    setPlan((p) => ({
      ...p,
      tiers: (p.tiers ?? []).map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const addTier = () => {
    setPlan((p) => ({
      ...p,
      tiers: [...(p.tiers ?? []), emptyTier((p.tiers?.length ?? 0) + 1)],
    }));
  };

  const removeTier = (idx: number) => {
    setPlan((p) => ({
      ...p,
      tiers: (p.tiers ?? []).filter((_, i) => i !== idx).map((t, i) => ({ ...t, tierOrder: i + 1 })),
    }));
  };

  const toggleMonth = (m: number) => {
    setPlan((p) => {
      const current = p.excludedMonths ?? [];
      return {
        ...p,
        excludedMonths: current.includes(m) ? current.filter((x) => x !== m) : [...current, m],
      };
    });
  };

  const canSave = useMemo(() => {
    return !!(plan.employeeId && plan.seasonId && plan.planName && plan.baseSalary != null && plan.commissionType);
  }, [plan]);

  const assignments = assignmentsQ.data?.data ?? [];
  const employees = employeesQ.data?.data ?? [];
  const seasons = seasonsQ.data?.data ?? [];

  return (
    <PageShell
      title={isEditMode ? "تعديل خطة عمولة" : "خطة عمولة جديدة"}
      subtitle="إعداد خطة عمولة لموظف ضمن موسم عمرة محدد"
      breadcrumbs={[
        { label: "العمرة" },
        { label: "خطط العمولة" },
        { label: isEditMode ? "تعديل" : "جديد" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/umrah/commission-plans">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Link>
          </Button>
          <GuardedButton
            perm="umrah:write"
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate(plan)}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />

      <PageStateWrapper
        isLoading={isEditMode && loadQ.isLoading}
        error={isEditMode ? loadQ.error : null}
        onRetry={() => loadQ.refetch()}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="basic">المعلومات الأساسية</TabsTrigger>
            <TabsTrigger value="conditions">الشروط</TabsTrigger>
            <TabsTrigger value="tiers">الشرائح</TabsTrigger>
            <TabsTrigger value="excluded">الأشهر المستثناة</TabsTrigger>
            <TabsTrigger value="simulator">محاكي</TabsTrigger>
          </TabsList>

          {/* BASIC INFO */}
          <TabsContent value="basic">
            <Card>
              <CardContent className="p-4 grid grid-cols-2 gap-3">
                <div>
                  <Label>الموظف *</Label>
                  <Select
                    value={plan.employeeId ? String(plan.employeeId) : ""}
                    onValueChange={(v) => setPlan({ ...plan, employeeId: Number(v), assignmentId: undefined })}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.fullName ?? e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>تعيين العمرة *</Label>
                  <Select
                    value={plan.assignmentId ? String(plan.assignmentId) : ""}
                    onValueChange={(v) => setPlan({ ...plan, assignmentId: Number(v) })}
                    disabled={!plan.employeeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={plan.employeeId ? "اختر التعيين" : "اختر الموظف أولاً"} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignments.map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.title ?? a.role ?? `#${a.id}`}</SelectItem>
                      ))}
                      {assignments.length === 0 && plan.employeeId && (
                        <SelectItem value="_none" disabled>لا توجد تعيينات عمرة</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الموسم *</Label>
                  <Select
                    value={plan.seasonId ? String(plan.seasonId) : ""}
                    onValueChange={(v) => setPlan({ ...plan, seasonId: Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
                    <SelectContent>
                      {seasons.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>اسم الخطة *</Label>
                  <Input
                    value={plan.planName ?? ""}
                    onChange={(e) => setPlan({ ...plan, planName: e.target.value })}
                    placeholder="مثال: خطة مندوب مبيعات 1447"
                  />
                </div>
                <div>
                  <Label>الراتب الأساسي *</Label>
                  <Input
                    type="number"
                    value={plan.baseSalary ?? ""}
                    onChange={(e) => setPlan({ ...plan, baseSalary: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>نوع العمولة *</Label>
                  <Select
                    value={plan.commissionType ?? "tiered"}
                    onValueChange={(v) => setPlan({ ...plan, commissionType: v as CommissionType })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">نسبة مئوية</SelectItem>
                      <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                      <SelectItem value="tiered">شرائح</SelectItem>
                      <SelectItem value="mixed">مختلط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(plan.commissionType === "percentage" || plan.commissionType === "mixed") && (
                  <div>
                    <Label>النسبة المئوية (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={plan.percentageRate ?? ""}
                      onChange={(e) => setPlan({ ...plan, percentageRate: Number(e.target.value) })}
                    />
                  </div>
                )}
                {(plan.commissionType === "fixed" || plan.commissionType === "mixed") && (
                  <div>
                    <Label>المبلغ الثابت</Label>
                    <Input
                      type="number"
                      value={plan.fixedAmount ?? ""}
                      onChange={(e) => setPlan({ ...plan, fixedAmount: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <Label>ملاحظات</Label>
                  <Textarea
                    rows={2}
                    value={plan.notes ?? ""}
                    onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONDITIONS */}
          <TabsContent value="conditions">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label>نوع الشرط</Label>
                  <Select
                    value={plan.conditionType ?? "none"}
                    onValueChange={(v) => setPlan({ ...plan, conditionType: v as ConditionType })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون شرط</SelectItem>
                      <SelectItem value="profit_avg">حد أدنى لمتوسط الربح</SelectItem>
                      <SelectItem value="sales_percent">حد أدنى لنسبة المبيعات</SelectItem>
                      <SelectItem value="both_or">أحد الشرطين (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>الحد الأدنى للربح / تأشيرة</Label>
                    <Input
                      type="number"
                      value={plan.minProfitPerVisa ?? ""}
                      onChange={(e) => setPlan({ ...plan, minProfitPerVisa: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>الحد الأدنى لنسبة المبيعات (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={plan.minSalesPercent ?? ""}
                      onChange={(e) => setPlan({ ...plan, minSalesPercent: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>الحد الأدنى لمتوسط السعر</Label>
                    <Input
                      type="number"
                      value={plan.minAvgPrice ?? ""}
                      onChange={(e) => setPlan({ ...plan, minAvgPrice: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {plan.conditionType !== "none" && (
                  <div className="text-xs text-muted-foreground flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
                    <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>إذا لم تتحقق الشروط في نهاية الشهر، يُدفع الراتب الأساسي فقط بدون عمولة.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TIERS */}
          <TabsContent value="tiers">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    حدد مقدار المكافأة لكل شريحة عدد معتمرين.
                  </p>
                  <GuardedButton perm="umrah:write" size="sm" variant="outline" onClick={addTier} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    إضافة شريحة
                  </GuardedButton>
                </div>

                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-start font-medium">#</th>
                        <th className="p-2 text-start font-medium">من (عدد)</th>
                        <th className="p-2 text-start font-medium">إلى (عدد)</th>
                        <th className="p-2 text-start font-medium">مكافأة/وحدة</th>
                        <th className="p-2 text-start font-medium">تراكمي؟</th>
                        <th className="p-2 text-start font-medium">ترتيب</th>
                        <th className="p-2 text-start font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(plan.tiers ?? []).map((t, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8"
                              value={t.fromCount}
                              onChange={(e) => updateTier(i, { fromCount: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8"
                              placeholder="∞"
                              value={t.toCount ?? ""}
                              onChange={(e) => updateTier(i, { toCount: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8"
                              value={t.bonusPerUnit}
                              onChange={(e) => updateTier(i, { bonusPerUnit: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <Checkbox
                              checked={t.isCumulative}
                              onCheckedChange={(c) => updateTier(i, { isCumulative: !!c })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              className="h-8 w-16"
                              value={t.tierOrder}
                              onChange={(e) => updateTier(i, { tierOrder: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <GuardedButton
                              perm="umrah:write"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeTier(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </GuardedButton>
                          </td>
                        </tr>
                      ))}
                      {(plan.tiers ?? []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                            لا توجد شرائح — أضف الأولى بالضغط على "إضافة شريحة".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EXCLUDED MONTHS */}
          <TabsContent value="excluded">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-3">
                  الأشهر الهجرية التي لا تُحتسب فيها العمولة (مثلاً: شهور لا تشهد عمليات عمرة نشطة).
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {HIJRI_MONTHS.map((name, idx) => {
                    const m = idx + 1;
                    const excluded = (plan.excludedMonths ?? []).includes(m);
                    return (
                      <label
                        key={m}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${
                          excluded ? "bg-red-50 border-red-200" : "hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={excluded}
                          onCheckedChange={() => toggleMonth(m)}
                        />
                        <span className={excluded ? "text-red-700 font-medium" : ""}>{name}</span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SIMULATOR */}
          <TabsContent value="simulator">
            <Card>
              <CardContent className="p-4 space-y-4">
                {!plan.id && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-amber-800">يرجى حفظ الخطة أولاً قبل التشغيل التجريبي.</span>
                  </div>
                )}
                <FormShell
                  schema={simSchema}
                  defaultValues={{
                    totalMutamers: 0,
                    avgProfitPerVisa: 0,
                    salesPercent: 0,
                    avgSalePrice: 0,
                  }}
                  submitLabel={simBusy ? "جاري التشغيل..." : "تشغيل المحاكاة"}
                  onSubmit={async (values) => {
                    await runSim(values);
                  }}
                >
                  {/* FormGrid only supports cols 1-3; use 2 + flow for 4 fields. */}
                  <FormGrid cols={2}>
                    <FormNumberField name="totalMutamers" label="عدد المعتمرين" />
                    <FormNumberField name="avgProfitPerVisa" label="متوسط الربح / تأشيرة" />
                    <FormNumberField name="salesPercent" label="نسبة المبيعات (%)" />
                    <FormNumberField name="avgSalePrice" label="متوسط سعر البيع" />
                  </FormGrid>
                </FormShell>

                {simResult && (
                  <div className="rounded border bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">نتيجة المحاكاة</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div className="bg-white rounded p-3 border">
                        <p className="text-xs text-muted-foreground">الراتب الأساسي</p>
                        <p className="text-lg font-bold">{formatCurrency(Number(simResult.baseSalary ?? plan.baseSalary ?? 0))}</p>
                      </div>
                      <div className="bg-white rounded p-3 border">
                        <p className="text-xs text-muted-foreground">العمولة المحتسبة</p>
                        <p className="text-lg font-bold text-emerald-700">{formatCurrency(Number(simResult.commission ?? 0))}</p>
                      </div>
                      <div className="bg-emerald-50 rounded p-3 border border-emerald-200">
                        <p className="text-xs text-emerald-700">الإجمالي النهائي</p>
                        <p className="text-lg font-bold text-emerald-800">{formatCurrency(Number(simResult.finalAmount ?? 0))}</p>
                      </div>
                    </div>
                    {Array.isArray(simResult.breakdown) && simResult.breakdown.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">تفصيل الاحتساب:</p>
                        <ul className="text-xs space-y-1">
                          {simResult.breakdown.map((b: any, i: number) => (
                            <li key={i} className="flex items-center justify-between p-2 bg-white rounded border">
                              <span>{b.label ?? b.description ?? `سطر ${i + 1}`}</span>
                              <span className="font-mono">{formatCurrency(Number(b.amount ?? 0))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {simResult.conditionsMet === false && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        الشروط لم تتحقق — العمولة = 0
                      </Badge>
                    )}
                  </div>
                )}

                {!simResult && plan.tiers && plan.tiers.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    ملاحظة: عدد الشرائح المعرّفة = {formatNumber(plan.tiers.length)}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageStateWrapper>
    </PageShell>
  );
}
