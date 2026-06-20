import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  PageStatusBadge,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Plus, X, Ban } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { DELEGATABLE_FEATURES, describeFeatures } from "@/lib/delegation-features";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
/**
 * HR-010 — Delegations admin page. Lists active/historical delegations from
 * GET /hr/delegations and creates new ones via POST. Server has no
 * PATCH/DELETE for delegations yet, so this page is list + create only.
 */
const DEFAULT_FORM = {
  delegateId: "",
  scope: "عام",
  reason: "",
  startDate: "",
  endDate: "",
  features: [] as string[],
};

export default function DelegationsPage() {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const { toast } = useToast();

  // Toggle a delegated module. Selecting "كل الصلاحيات" (*) clears the rest;
  // selecting a specific module clears "*".
  const toggleFeature = (key: string) => setForm((f) => {
    if (key === "*") return { ...f, features: f.features.includes("*") ? [] : ["*"] };
    const without = f.features.filter((k) => k !== "*");
    return { ...f, features: without.includes(key) ? without.filter((k) => k !== key) : [...without, key] };
  });

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["hr-delegations"], "/hr/delegations");
  const delegations = asList(data?.data || data);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(delegations);


  const createMut = useApiMutation<any, { delegateId: number; scope?: string; reason: string; startDate?: string; endDate?: string; features?: string[] }>(
    "/hr/delegations",
    "POST",
    [["hr-delegations"]],
    {
      successMessage: "تم إنشاء التفويض",
      onSuccess: () => {
        setShowNew(false);
        setForm(DEFAULT_FORM);
        refetch();
      },
    },
  );

  const submit = () => {
    if (!form.delegateId || !form.reason.trim()) return;
    createMut.mutate({
      delegateId: Number(form.delegateId),
      scope: form.scope.trim() || undefined,
      reason: form.reason.trim(),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      // Empty ⇒ backend defaults to ["*"] (all the delegator's authority).
      features: form.features.length > 0 ? form.features : undefined,
    });
  };

  const revoke = async (id: number) => {
    try {
      await apiFetch(`/hr/delegations/${id}/revoke`, { method: "PATCH", body: "{}" });
      toast({ title: "تم إلغاء التفويض" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "تعذّر الإلغاء" });
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: "delegatorName", header: "المُفوِّض", render: (r) => r.delegatorName || `#${r.delegatorId}` },
    { key: "delegateName", header: "المُفوَّض إليه", render: (r) => r.delegateName || `#${r.delegateId}` },
    { key: "features", header: "الصلاحيات المفوَّضة", render: (r) => <span className="max-w-[260px] truncate inline-block">{describeFeatures(r.features)}</span> },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "startDate", header: "من", render: (r) => (r.startDate ? formatDateAr(r.startDate) : "—") },
    { key: "endDate", header: "إلى", render: (r) => (r.endDate ? formatDateAr(r.endDate) : "—") },
    { key: "reason", header: "السبب", render: (r) => <span className="max-w-[260px] truncate inline-block">{r.reason || "—"}</span> },
    { key: "actions", header: "", render: (r) => (
      r.status === "active" ? (
        <GuardedButton perm="hr.organization:approve" variant="ghost" size="sm" className="text-status-error-foreground h-7 px-2" onClick={() => revoke(r.id)}>
          <Ban className="h-3.5 w-3.5 me-1" /> إلغاء
        </GuardedButton>
      ) : null
    ) },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="التفويضات"
      subtitle="تفويض الصلاحيات بين الموظفين لفترة محدّدة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "التفويضات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_delegations"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تفويضات الصلاحيات", total: printRows.length },
              items: printRows.map((d: any) => ({
                "المُفوِّض": d.delegatorName || d.fromEmployeeName || "—",
                "المُفوَّض إليه": d.delegateName || d.toEmployeeName || "—",
                "النوع": d.delegationType || d.type || "—",
                "من تاريخ": d.startDate || "—",
                "إلى تاريخ": d.endDate || "—",
                "الحالة": d.status || "—",
              })),
            })}
          />
          {!showNew ? (
            <GuardedButton perm="hr.organization:approve" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 ml-1" /> تفويض جديد
            </GuardedButton>
          ) : (
            <Button variant="outline" onClick={() => { setShowNew(false); setForm(DEFAULT_FORM); }}><X className="h-4 w-4 ml-1" /> إلغاء</Button>
          )}
        </div>
      }
    >
      <HrTabsNav />
      {showNew && (
        <Card className="mb-4 border-status-info-surface">
          <CardHeader className="pb-3"><CardTitle className="text-base">تفويض جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <EmployeeSelect
                  label="المُفوَّض إليه"
                  value={form.delegateId}
                  onChange={(v) => setForm((f) => ({ ...f, delegateId: v }))}
                />
              </div>
              <div>
                <Label>النطاق</Label>
                <Input value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} placeholder="عام / مالية / موارد بشرية…" className="mt-1" />
              </div>
              <div>
                <Label>تاريخ البداية</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>تاريخ النهاية</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label>السبب</Label>
                <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="سبب التفويض" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label>الصلاحيات المفوَّضة</Label>
                <p className="text-xs text-muted-foreground mb-2">اختر الأقسام التي يحقّ للمفوَّض إليه التصرّف فيها نيابةً عنك. لا يمكن تفويض أكثر مما تملك.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DELEGATABLE_FEATURES.map((feat) => {
                    const checked = form.features.includes(feat.key);
                    const disabled = feat.key !== "*" && form.features.includes("*");
                    return (
                      <label key={feat.key} className={`flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer ${checked ? "bg-status-info-surface border-status-info" : "hover:bg-surface-subtle"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleFeature(feat.key)} className="accent-status-info" />
                        {feat.label}
                      </label>
                    );
                  })}
                </div>
                {form.features.length === 0 && (
                  <p className="text-xs text-status-warning-foreground mt-1">لم تُحدِّد أقسامًا — سيُفوَّض كامل صلاحياتك افتراضيًا.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <GuardedButton perm="hr.organization:approve" disabled={!form.delegateId || !form.reason.trim() || createMut.isPending} onClick={submit} rateLimitAware>
                {createMut.isPending ? "جاري الحفظ..." : "حفظ التفويض"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={delegations}
        emptyMessage="لا توجد تفويضات"
        noToolbar
      />
    </PageShell>
  );
}
