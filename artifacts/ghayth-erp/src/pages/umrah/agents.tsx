import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Users, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

interface AgentForm {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  country: string;
  profitMargin: string;
  contractRef: string;
  currency: string;
  notes: string;
}

const emptyForm: AgentForm = {
  name: "", contactPerson: "", phone: "", email: "", country: "",
  profitMargin: "", contractRef: "", currency: "SAR", notes: "",
};

export default function UmrahAgents() {
  const [, navigate] = useLocation();
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const items = resp?.data || [];
  const { toast } = useToast();

  const [editing, setEditing] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMut = useApiMutation<any, any>("/umrah/agents", "POST", [["umrah-agents"]], {
    onSuccess: () => { refetch(); closeDialog(); toast({ title: "تم إضافة الوكيل بنجاح" }); },
  });
  const updateMut = useApiMutation<any, any>(() => `/umrah/agents/${editing?.id}`, "PATCH", [["umrah-agents"]], {
    onSuccess: () => { refetch(); closeDialog(); toast({ title: "تم تحديث الوكيل بنجاح" }); },
  });
  const deleteMut = useApiMutation<any, any>(() => `/umrah/agents/${deleteId}`, "DELETE", [["umrah-agents"]], {
    onSuccess: () => { refetch(); setDeleteId(null); toast({ title: "تم حذف الوكيل" }); },
  });

  function openCreate() {
    setForm(emptyForm);
    setEditing({});
    setIsNew(true);
  }

  function openEdit(agent: any) {
    setForm({
      name: agent.name || "",
      contactPerson: agent.contactPerson || "",
      phone: agent.phone || "",
      email: agent.email || "",
      country: agent.country || "",
      profitMargin: agent.profitMargin != null ? String(agent.profitMargin) : "",
      contractRef: agent.contractRef || "",
      currency: agent.currency || "SAR",
      notes: agent.notes || "",
    });
    setEditing(agent);
    setIsNew(false);
  }

  function closeDialog() {
    setEditing(null);
    setIsNew(false);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      contactPerson: form.contactPerson || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      country: form.country || undefined,
      profitMargin: form.profitMargin ? Number(form.profitMargin) : 0,
      contractRef: form.contractRef || undefined,
      currency: form.currency || "SAR",
      notes: form.notes || undefined,
    };
    if (isNew) createMut.mutate(payload);
    else updateMut.mutate(payload);
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const activeCount = items.filter((a: any) => a.status === "active").length;
  const kpiCards = [
    { label: "إجمالي الوكلاء", value: items.length, icon: Building2, color: "text-blue-600 bg-blue-50" },
    { label: "وكلاء نشطون", value: activeCount, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "وكلاء موقوفون", value: items.length - activeCount, icon: Building2, color: "text-red-600 bg-red-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الاسم", sortable: true, searchable: true, render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "country", header: "البلد", sortable: true, searchable: true },
    { key: "phone", header: "الهاتف", searchable: true },
    { key: "email", header: "البريد", searchable: true },
    { key: "contractRef", header: "مرجع العقد" },
    { key: "profitMargin", header: "نسبة الربح", sortable: true, render: (a) => `${a.profitMargin ?? 0}%` },
    { key: "status", header: "الحالة", sortable: true, render: (a) => <PageStatusBadge status={a.status} /> },
    {
      key: "id" as any, header: "", render: (a) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell title="وكلاء العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "الوكلاء" }]}>
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">إدارة وكلاء العمرة</p>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />إضافة وكيل</Button>
      </div>

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد وكلاء"
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        searchPlaceholder="بحث عن وكيل..."
        onRowClick={(row) => navigate(`/umrah/agents/${row.id}`)}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isNew ? "إضافة وكيل جديد" : "تعديل الوكيل"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الشخص المسؤول</Label>
                <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div>
                <Label>البلد</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الهاتف</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>نسبة الربح %</Label>
                <Input type="number" value={form.profitMargin} onChange={(e) => setForm({ ...form, profitMargin: e.target.value })} />
              </div>
              <div>
                <Label>مرجع العقد</Label>
                <Input value={form.contractRef} onChange={(e) => setForm({ ...form, contractRef: e.target.value })} />
              </div>
              <div>
                <Label>العملة</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending || updateMut.isPending} rateLimitAware>
              {createMut.isPending || updateMut.isPending ? "جاري الحفظ..." : isNew ? "إنشاء" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p>هل أنت متأكد من حذف هذا الوكيل؟ لا يمكن حذف وكيل مرتبط بمعتمرين.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate({})} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
