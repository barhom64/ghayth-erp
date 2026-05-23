import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { formatDateAr } from "@/lib/formatters";
import { Plus, X } from "lucide-react";

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
};

export default function DelegationsPage() {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["hr-delegations"], "/hr/delegations");
  const delegations = asList(data?.data || data);

  const { data: empsResp } = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList(empsResp?.data || empsResp);

  const createMut = useApiMutation<any, { delegateId: number; scope?: string; reason: string; startDate?: string; endDate?: string }>(
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
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "delegatorName", header: "المُفوِّض", render: (r) => r.delegatorName || `#${r.delegatorId}` },
    { key: "delegateName", header: "المُفوَّض إليه", render: (r) => r.delegateName || `#${r.delegateId}` },
    { key: "scope", header: "النطاق", render: (r) => r.scope || "—" },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "startDate", header: "من", render: (r) => (r.startDate ? formatDateAr(r.startDate) : "—") },
    { key: "endDate", header: "إلى", render: (r) => (r.endDate ? formatDateAr(r.endDate) : "—") },
    { key: "reason", header: "السبب", render: (r) => <span className="max-w-[260px] truncate inline-block">{r.reason || "—"}</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="التفويضات"
      subtitle="تفويض الصلاحيات بين الموظفين لفترة محدّدة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "التفويضات" }]}
      actions={
        !showNew ? (
          <GuardedButton perm="hr.organization:approve" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 ml-1" /> تفويض جديد
          </GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => { setShowNew(false); setForm(DEFAULT_FORM); }}><X className="h-4 w-4 ml-1" /> إلغاء</Button>
        )
      }
    >
      {showNew && (
        <Card className="mb-4 border-status-info-surface">
          <CardHeader className="pb-3"><CardTitle className="text-base">تفويض جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>المُفوَّض إليه</Label>
                <Select value={form.delegateId} onValueChange={(v) => setForm((f) => ({ ...f, delegateId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر موظفًا" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name || `#${e.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        data={delegations}
        emptyMessage="لا توجد تفويضات"
        noToolbar
      />
    </PageShell>
  );
}
