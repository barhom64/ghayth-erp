import { useEffect, useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { ArrowRight, Plus, Save, Trash2, Calculator, AlertCircle } from "lucide-react";

// Simulator schema. Its FormShell is independent because the
// simulate inputs aren't persisted on the plan row — they're
// parameters for the /simulate endpoint.
const simSchema = z.object({
  totalMutamers: z.coerce.number().int().nonnegative(),
  avgProfitPerVisa: z.coerce.number().nonnegative(),
  salesPercent: z.coerce.number().min(0).max(100),
  avgSalePrice: z.coerce.number().nonnegative(),
});
type SimForm = z.infer<typeof simSchema>;

// Plan schema covers the four data-entry tabs (basic / conditions /
// tiers / excluded). Conditional fields (percentageRate, fixedAmount,
// minProfit*, etc.) are optional — the body subcomponents render
// them based on the current commissionType / conditionType via
// useWatch.
const tierSchema = z.object({
  id: z.number().int().optional(),
  fromCount: z.coerce.number().int().nonnegative(),
  toCount: z.union([z.coerce.number().int().nonnegative(), z.null()]),
  bonusPerUnit: z.coerce.number().nonnegative(),
  isCumulative: z.boolean(),
  tierOrder: z.coerce.number().int().min(1),
});

const planSchema = z.object({
  id: z.number().int().optional(),
  employeeId: z.coerce.number().int().positive("الموظف مطلوب"),
  assignmentId: z.coerce.number().int().positive().optional(),
  seasonId: z.coerce.number().int().positive("الموسم مطلوب"),
  planName: z.string().trim().min(1, "اسم الخطة مطلوب"),
  baseSalary: z.coerce.number().nonnegative("الراتب الأساسي مطلوب"),
  commissionType: z.enum(["percentage", "fixed", "tiered", "mixed"]),
  percentageRate: z.coerce.number().nonnegative().optional(),
  fixedAmount: z.coerce.number().nonnegative().optional(),
  conditionType: z.enum(["profit_avg", "sales_percent", "both_or", "none"]),
  minProfitPerVisa: z.coerce.number().nonnegative().optional(),
  minSalesPercent: z.coerce.number().min(0).max(100).optional(),
  minAvgPrice: z.coerce.number().nonnegative().optional(),
  tiers: z.array(tierSchema),
  excludedMonths: z.array(z.coerce.number().int().min(1).max(12)),
  notes: z.string().trim(),
});
type PlanForm = z.infer<typeof planSchema>;

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

  const loadQ = useApiQuery<{ data: CommissionPlan }>(
    ["umrah-commission-plan", planId ?? ""],
    isEditMode && planId ? `/umrah/commission-plans/${planId}` : null,
  );

  const employeesQ = useApiQuery<{ data: any[] }>(["employees"], "/employees");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");

  // The persisted plan id — populated either when the edit-mode
  // server response arrives, or after a successful create. Drives
  // the simulator's enable-only-after-save guard.
  const [planRowId, setPlanRowId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isEditMode && loadQ.data?.data?.id) {
      setPlanRowId(loadQ.data.data.id);
    }
  }, [isEditMode, loadQ.data]);

  // Server-state hydration: defaults come from loadQ.data (edit) or
  // an empty seed (create). FormShell key={remountKey} re-mounts the
  // form the moment the server data lands — no useEffect → setForm
  // round-trip.
  const planDefaults: PlanForm = (() => {
    if (isEditMode && loadQ.data?.data) {
      const loaded = loadQ.data.data;
      return {
        id: loaded.id,
        employeeId: loaded.employeeId ?? 0,
        assignmentId: loaded.assignmentId,
        seasonId: loaded.seasonId ?? 0,
        planName: loaded.planName ?? "",
        baseSalary: loaded.baseSalary ?? 0,
        commissionType: (loaded.commissionType ?? "tiered") as CommissionType,
        percentageRate: loaded.percentageRate,
        fixedAmount: loaded.fixedAmount,
        conditionType: (loaded.conditionType ?? "none") as ConditionType,
        minProfitPerVisa: loaded.minProfitPerVisa,
        minSalesPercent: loaded.minSalesPercent,
        minAvgPrice: loaded.minAvgPrice,
        tiers: loaded.tiers?.length ? loaded.tiers : [emptyTier(1)],
        excludedMonths: loaded.excludedMonths ?? [],
        notes: loaded.notes ?? "",
      };
    }
    return {
      employeeId: 0,
      seasonId: 0,
      planName: "",
      baseSalary: 0,
      commissionType: "tiered" as const,
      conditionType: "none" as const,
      tiers: [emptyTier(1)],
      excludedMonths: [],
      notes: "",
    };
  })();
  const remountKey = isEditMode ? (loadQ.data?.data?.id ?? "loading") : "new";

  const saveMut = useApiMutation<any, PlanForm>(
    (body) => (body.id ? `/umrah/commission-plans/${body.id}` : "/umrah/commission-plans"),
    isEditMode ? "PATCH" : "POST",
    [["umrah-commission-plans"]],
    {
      successMessage: isEditMode ? "تم تحديث الخطة" : "تم إنشاء الخطة",
      onSuccess: (res: any) => {
        const newId = res?.data?.id;
        if (newId) setPlanRowId(newId);
        if (!isEditMode && newId) {
          setLocation(`/umrah/commission-plans/${newId}/edit`);
        }
      },
    },
  );

  // Simulator status flags — stay as useState (not form data).
  const [simResult, setSimResult] = useState<any>(null);
  const [simBusy, setSimBusy] = useState(false);

  const runSim = async (values: SimForm) => {
    if (!planRowId) {
      toast({ variant: "destructive", title: "يرجى حفظ الخطة أولاً قبل التشغيل التجريبي" });
      return;
    }
    setSimBusy(true);
    try {
      const res: any = await apiFetch(`/umrah/commission-plans/${planRowId}/simulate`, {
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
        <Button asChild variant="outline" className="gap-2">
          <Link href="/umrah/commission-plans">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Link>
        </Button>
      }
    >
      <UmrahTabsNav />

      <PageStateWrapper
        isLoading={isEditMode && loadQ.isLoading}
        error={isEditMode ? loadQ.error : null}
        onRetry={() => loadQ.refetch()}
      >
        <FormShell
          key={remountKey}
          schema={planSchema}
          defaultValues={planDefaults}
          submitLabel={saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
          onSubmit={async (values) => {
            await saveMut.mutateAsync(values);
          }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="basic">المعلومات الأساسية</TabsTrigger>
              <TabsTrigger value="conditions">الشروط</TabsTrigger>
              <TabsTrigger value="tiers">الشرائح</TabsTrigger>
              <TabsTrigger value="excluded">الأشهر المستثناة</TabsTrigger>
              <TabsTrigger value="simulator">محاكي</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <Card>
                <CardContent className="p-4">
                  <BasicTab employees={employees} seasons={seasons} disableEmployeeChange={isEditMode} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conditions">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <ConditionsTab />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tiers">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <TiersTab />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="excluded">
              <Card>
                <CardContent className="p-4">
                  <ExcludedMonthsTab />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="simulator">
              {/* Independent FormShell — its inputs aren't part of the plan. */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  {!planRowId && (
                    <div className="flex items-start gap-2 p-3 bg-status-warning-surface border border-status-warning-surface rounded text-sm">
                      <AlertCircle className="h-4 w-4 text-status-warning-foreground shrink-0 mt-0.5" />
                      <span className="text-status-warning-foreground">يرجى حفظ الخطة أولاً قبل التشغيل التجريبي.</span>
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
                        <Calculator className="h-5 w-5 text-status-info-foreground" />
                        <h3 className="font-semibold">نتيجة المحاكاة</h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white rounded p-3 border">
                          <p className="text-xs text-muted-foreground">الراتب الأساسي</p>
                          <p className="text-lg font-bold">{formatCurrency(Number(simResult.baseSalary ?? 0))}</p>
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </FormShell>
      </PageStateWrapper>
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Plan-form subcomponents — each tab reads/writes via useFormContext
// + useWatch so they share the single FormShell state above.

function BasicTab({
  employees, seasons, disableEmployeeChange,
}: { employees: any[]; seasons: any[]; disableEmployeeChange: boolean }) {
  const commissionType = useWatch<PlanForm, "commissionType">({ name: "commissionType" });
  return (
    <FormGrid cols={2}>
      <FormSelectField
        name="employeeId"
        label="الموظف"
        required
        options={[
          { value: "0", label: "اختر الموظف" },
          ...employees.map((e: any) => ({ value: String(e.id), label: e.fullName ?? e.name })),
        ]}
      />
      <AssignmentField disabled={disableEmployeeChange} />
      <FormSelectField
        name="seasonId"
        label="الموسم"
        required
        options={[
          { value: "0", label: "اختر الموسم" },
          ...seasons.map((s: any) => ({ value: String(s.id), label: s.title })),
        ]}
      />
      <FormTextField name="planName" label="اسم الخطة" required placeholder="مثال: خطة مندوب مبيعات 1447" />
      <FormNumberField name="baseSalary" label="الراتب الأساسي" required />
      <FormSelectField
        name="commissionType"
        label="نوع العمولة"
        required
        options={[
          { value: "percentage", label: "نسبة مئوية" },
          { value: "fixed", label: "مبلغ ثابت" },
          { value: "tiered", label: "شرائح" },
          { value: "mixed", label: "مختلط" },
        ]}
      />
      {(commissionType === "percentage" || commissionType === "mixed") && (
        <FormNumberField name="percentageRate" label="النسبة المئوية (%)" />
      )}
      {(commissionType === "fixed" || commissionType === "mixed") && (
        <FormNumberField name="fixedAmount" label="المبلغ الثابت" />
      )}
      <FormTextareaField name="notes" label="ملاحظات" rows={2} className="md:col-span-2" />
    </FormGrid>
  );
}

// Dependent dropdown: assignmentId options come from /umrah/employees/${employeeId}/assignments.
// useWatch tracks the parent select; key={employeeId} remounts the field
// so its stale value gets cleared when the operator switches employees.
function AssignmentField({ disabled }: { disabled: boolean }) {
  const employeeId = useWatch<PlanForm, "employeeId">({ name: "employeeId" });
  const enabled = !!employeeId && employeeId > 0;
  const assignmentsQ = useApiQuery<{ data: any[] }>(
    ["umrah-employee-assignments", String(employeeId ?? "")],
    enabled ? `/umrah/employees/${employeeId}/assignments` : null,
  );
  const assignments = assignmentsQ.data?.data ?? [];
  return (
    <FormSelectField
      key={`assignment-${employeeId}`}
      name="assignmentId"
      label="تعيين العمرة"
      options={[
        { value: "", label: enabled ? (assignments.length === 0 ? "لا توجد تعيينات عمرة" : "اختر التعيين") : "اختر الموظف أولاً" },
        ...assignments.map((a: any) => ({ value: String(a.id), label: a.title ?? a.role ?? `#${a.id}` })),
      ]}
      disabled={disabled || !enabled || assignments.length === 0}
    />
  );
}

function ConditionsTab() {
  const conditionType = useWatch<PlanForm, "conditionType">({ name: "conditionType" });
  return (
    <>
      <FormSelectField
        name="conditionType"
        label="نوع الشرط"
        options={[
          { value: "none", label: "بدون شرط" },
          { value: "profit_avg", label: "حد أدنى لمتوسط الربح" },
          { value: "sales_percent", label: "حد أدنى لنسبة المبيعات" },
          { value: "both_or", label: "أحد الشرطين (OR)" },
        ]}
      />
      <FormGrid cols={3}>
        <FormNumberField name="minProfitPerVisa" label="الحد الأدنى للربح / تأشيرة" />
        <FormNumberField name="minSalesPercent" label="الحد الأدنى لنسبة المبيعات (%)" />
        <FormNumberField name="minAvgPrice" label="الحد الأدنى لمتوسط السعر" />
      </FormGrid>
      {conditionType !== "none" && (
        <div className="text-xs text-muted-foreground flex items-start gap-2 p-3 bg-status-info-surface border border-status-info-surface rounded">
          <AlertCircle className="h-4 w-4 text-status-info-foreground shrink-0 mt-0.5" />
          <span>إذا لم تتحقق الشروط في نهاية الشهر، يُدفع الراتب الأساسي فقط بدون عمولة.</span>
        </div>
      )}
    </>
  );
}

// Dynamic tiers editor via useFieldArray. Per-row fields register to
// `tiers.${idx}.fieldName` paths; remove() re-indexes and a separate
// TierCumulativeCell drives the boolean checkbox via setValue.
function TiersTab() {
  const { control, register, setValue } = useFormContext<PlanForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "tiers" });
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          حدد مقدار المكافأة لكل شريحة عدد معتمرين.
        </p>
        <GuardedButton
          perm="umrah:write"
          size="sm"
          variant="outline"
          type="button"
          onClick={() => append(emptyTier(fields.length + 1))}
          className="gap-1"
        >
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
            {fields.map((field, i) => (
              <tr key={field.id} className="border-t">
                <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    {...register(`tiers.${i}.fromCount`, { valueAsNumber: true })}
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    placeholder="∞"
                    {...register(`tiers.${i}.toCount`, {
                      setValueAs: (v) => v === "" || v === null ? null : Number(v),
                    })}
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    {...register(`tiers.${i}.bonusPerUnit`, { valueAsNumber: true })}
                  />
                </td>
                <td className="p-2">
                  <TierCumulativeCell idx={i} setValue={setValue} />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8 w-16"
                    {...register(`tiers.${i}.tierOrder`, { valueAsNumber: true })}
                  />
                </td>
                <td className="p-2">
                  <GuardedButton
                    perm="umrah:write"
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-status-error-foreground" />
                  </GuardedButton>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  لا توجد شرائح — أضف الأولى بالضغط على "إضافة شريحة".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TierCumulativeCell({
  idx,
  setValue,
}: {
  idx: number;
  setValue: ReturnType<typeof useFormContext<PlanForm>>["setValue"];
}) {
  const path = `tiers.${idx}.isCumulative` as const;
  const checked = useWatch<PlanForm>({ name: path }) as unknown as boolean;
  return (
    <Checkbox
      checked={Boolean(checked)}
      onCheckedChange={(c) => setValue(path, !!c, { shouldDirty: true })}
    />
  );
}

// Toggle-grid for the Hijri-month excluded list. setValue replaces
// the whole array on each click — same shape the server expects.
function ExcludedMonthsTab() {
  const { setValue } = useFormContext<PlanForm>();
  const excluded = (useWatch<PlanForm, "excludedMonths">({ name: "excludedMonths" }) ?? []) as number[];
  const toggle = (m: number) => {
    setValue(
      "excludedMonths",
      excluded.includes(m) ? excluded.filter((x) => x !== m) : [...excluded, m],
      { shouldDirty: true },
    );
  };
  return (
    <>
      <p className="text-sm text-muted-foreground mb-3">
        الأشهر الهجرية التي لا تُحتسب فيها العمولة (مثلاً: شهور لا تشهد عمليات عمرة نشطة).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {HIJRI_MONTHS.map((name, idx) => {
          const m = idx + 1;
          const isExcluded = excluded.includes(m);
          return (
            <label
              key={m}
              className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${
                isExcluded ? "bg-status-error-surface border-status-error-surface" : "hover:bg-muted/30"
              }`}
            >
              <Checkbox
                checked={isExcluded}
                onCheckedChange={() => toggle(m)}
              />
              <span className={isExcluded ? "text-status-error-foreground font-medium" : ""}>{name}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
