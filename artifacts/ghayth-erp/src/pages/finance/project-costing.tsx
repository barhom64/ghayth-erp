import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@workspace/ui-core";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { Plus } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@workspace/ui-core";
import {
  FormShell, FormNumberField, FormTextareaField, FormDateField, FormSelectField, FormGrid,
} from "@/components/form-shell";

// projectId stays a string until the submit handler casts to number.
// amount uses z.coerce.number().positive() — was tracked as string
// and Number()-coerced; schema now blocks 0 / negative submissions.
const costSchema = z.object({
  projectId: z.string().min(1, "اختر المشروع"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().trim(),
  date: z.string(),
  category: z.enum(["direct", "indirect", "overhead", "labor", "materials"]),
});
type CostForm = z.infer<typeof costSchema>;
const CATEGORY_OPTIONS = [
  { value: "direct", label: "تكلفة مباشرة" },
  { value: "indirect", label: "تكلفة غير مباشرة" },
  { value: "overhead", label: "تكاليف عامة" },
  { value: "labor", label: "تكاليف عمالة" },
  { value: "materials", label: "مواد" },
];

type Project = {
  id: number;
  ref: string;
  name: string;
  description?: string;
  status: string;
  budget: number;
  actualCost: number;
  budgetRemaining: number;
  startDate?: string;
  endDate?: string;
};

export default function ProjectCostingPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showAddCost, setShowAddCost] = useState(false);
  // FIN-010: the cost is recorded by POST /projects/:id/costs (projects.ts) —
  // there is no POST under /finance/projects/:id/costs (finance-hardening
  // exposes only the GET), so the old URL 404'd on every "add cost".
  const addCostMutation = useApiMutation<any, any>(
    (body) => `/projects/${body.projectId}/costs`,
    "POST",
    [["projects-finance"]],
    { successMessage: "تم تسجيل التكلفة بنجاح" },
  );

  const handleAddCost = async (values: CostForm) => {
    await addCostMutation.mutateAsync({
      ...values,
      projectId: Number(values.projectId),
      // createCostSchema expects `costDate`; the form field is `date`.
      costDate: values.date,
    });
    setShowAddCost(false);
  };

  const { data, isLoading, isError } = useApiQuery<any>(
    ["projects-finance"],
    `/finance/projects${scopeSuffix}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const list: Project[] = data?.data ?? data ?? [];

  const totals = list.reduce((acc, p) => ({
    budget: acc.budget + Number(p.budget ?? 0),
    actualCost: acc.actualCost + Number(p.actualCost ?? 0),
  }), { budget: 0, actualCost: 0 });

  return (
    <PageShell
      title="تكاليف المشاريع"
      subtitle="متابعة الميزانيات والتكاليف الفعلية لكل مشروع"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تكاليف المشاريع" }]}
      loading={isLoading}
      actions={
        <GuardedButton perm="finance:create" onClick={() => setShowAddCost(true)} disabled={list.length === 0}>
          <Plus className="h-4 w-4 ml-2" />
          تسجيل تكلفة
        </GuardedButton>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">عدد المشاريع</div>
          <div className="text-2xl font-bold text-status-neutral-foreground mt-1">{list.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">إجمالي الميزانيات</div>
          <div className="text-2xl font-bold text-status-info-foreground mt-1">{formatCurrency(totals.budget)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">إجمالي التكاليف الفعلية</div>
          <div className="text-2xl font-bold text-status-neutral-foreground mt-1">{formatCurrency(totals.actualCost)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">المتبقي الإجمالي</div>
          <div className={`text-2xl font-bold mt-1 ${totals.budget - totals.actualCost >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(totals.budget - totals.actualCost)}</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">لا توجد مشاريع مسجلة</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="bg-surface-subtle border-b px-4 py-3 text-xs font-semibold text-muted-foreground grid grid-cols-7 gap-2">
                <div>الرقم</div>
                <div>اسم المشروع</div>
                <div>الحالة</div>
                <div>الميزانية</div>
                <div>التكلفة الفعلية</div>
                <div>المتبقي</div>
                <div>الاستخدام</div>
              </div>
              {list.map((row) => {
                const pct = row.budget > 0 ? Math.min(100, Math.round((row.actualCost / row.budget) * 100)) : 0;
                return (
                  <div
                    key={row.id}
                    className="border-b px-4 py-3 grid grid-cols-7 gap-2 items-center hover:bg-surface-subtle text-sm cursor-pointer"
                    onClick={() => navigate(`/finance/project-costing/${row.id}`)}
                  >
                    <div><span className="font-mono text-xs bg-surface-subtle px-2 py-0.5 rounded">{row.ref}</span></div>
                    <div>
                      <span className="text-status-info-foreground hover:underline font-medium text-right">{row.name}</span>
                    </div>
                    <div><PageStatusBadge status={row.status} domain="project" /></div>
                    <div>{formatCurrency(row.budget)}</div>
                    <div>{formatCurrency(row.actualCost)}</div>
                    <div><span className={row.budgetRemaining < 0 ? "text-status-error-foreground font-semibold" : "text-status-success-foreground"}>{formatCurrency(row.budgetRemaining)}</span></div>
                    <div>
                      <div className="w-24">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-surface-subtle rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct > 90 ? "bg-status-error-surface0" : pct > 70 ? "bg-status-warning-surface0" : "bg-status-success-surface0"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {showAddCost && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddCost(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">تسجيل تكلفة جديدة</h3>
            </div>
            <div className="p-6">
              <FormShell
                schema={costSchema}
                defaultValues={{
                  projectId: "",
                  amount: 0,
                  description: "",
                  date: todayLocal(),
                  category: "direct" as const,
                }}
                submitLabel="تسجيل التكلفة"
                secondaryActions={
                  <Button type="button" variant="outline" onClick={() => setShowAddCost(false)}>
                    إلغاء
                  </Button>
                }
                onSubmit={async (values, ctx) => {
                  await handleAddCost(values);
                  ctx.reset();
                }}
              >
                <FormGrid cols={1}>
                  <FormSelectField
                    name="projectId"
                    label="المشروع"
                    required
                    options={[
                      { value: "", label: "-- اختر المشروع --" },
                      ...list.map(p => ({ value: String(p.id), label: p.name })),
                    ]}
                  />
                  <FormNumberField name="amount" label="المبلغ" required placeholder="0.00" />
                  <FormSelectField name="category" label="التصنيف" options={CATEGORY_OPTIONS} />
                  <FormDateField name="date" label="التاريخ" />
                  <FormTextareaField name="description" label="البيان" rows={2} />
                </FormGrid>
              </FormShell>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
