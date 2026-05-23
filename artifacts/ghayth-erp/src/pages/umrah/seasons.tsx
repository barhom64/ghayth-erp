import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { PageShell } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

export default function UmrahSeasons() {
  const [, navigate] = useLocation();
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const items = resp?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();

  const save = async () => {
    try {
      await apiFetch("/umrah/seasons", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء الموسم" });
      setShowForm(false);
      setForm({});
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ" }); }
  };

  const closeSeason = async (id: number) => {
    try {
      await apiFetch(`/umrah/seasons/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
      toast({ title: "تم إغلاق الموسم" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.error || "لا يمكن إغلاق الموسم" });
    }
  };

  const openCount = items.filter((s: any) => s.status === "open").length;

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, searchable: true },
    { key: "startDate", header: "تاريخ البداية", sortable: true, render: (r: any) => formatDateAr(r.startDate) },
    { key: "endDate", header: "تاريخ النهاية", sortable: true, render: (r: any) => formatDateAr(r.endDate) },
    { key: "status", header: "الحالة", render: (r: any) => <PageStatusBadge status={r.status} /> },
    {
      key: "actions" as any, header: "إجراءات", render: (r: any) =>
        r.status === "open" ? (
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); closeSeason(r.id); }}>إغلاق الموسم</Button>
        ) : null
    },
  ];

  return (
    <PageShell
      title="مواسم العمرة"
      subtitle="إدارة مواسم العمرة"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "مواسم العمرة" }]}
      loading={isLoading}
      actions={<GuardedButton perm="umrah:create" onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />موسم جديد</GuardedButton>}
    >
      <div className="flex gap-3 text-sm text-muted-foreground">
        <span><span className="font-bold text-foreground">{items.length}</span> إجمالي المواسم</span>
        <span>•</span>
        <span><span className="font-bold text-status-success-foreground">{openCount}</span> مفتوح</span>
        <span>•</span>
        <span><span className="font-bold text-foreground">{items.length - openCount}</span> مغلق</span>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-3 gap-4">
            <div><Label>العنوان *</Label><Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>تاريخ البداية *</Label><UnifiedDateInput value={form.startDate || ""} onChange={v => setForm({ ...form, startDate: v })} showDualCalendar showPresets /></div>
            <div><Label>تاريخ النهاية *</Label><UnifiedDateInput value={form.endDate || ""} onChange={v => setForm({ ...form, endDate: v })} showDualCalendar showPresets /></div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={save} disabled={!form.title || !form.startDate || !form.endDate}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} data={items} isLoading={isLoading} isError={isError} error={error} onRowClick={(row) => navigate(`/umrah/seasons/${row.id}`)} />
    </PageShell>
  );
}
