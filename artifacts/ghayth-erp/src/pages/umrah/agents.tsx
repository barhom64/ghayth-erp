import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Users, Pencil, Trash2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

const agentFormSchema = z.object({
  name: z.string().min(1, "اسم الوكيل مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  profitMargin: z.string().optional(),
  contractRef: z.string().optional(),
  currency: z.string(),
  notes: z.string().optional(),
});
type AgentForm = z.infer<typeof agentFormSchema>;

const emptyForm: AgentForm = {
  name: "", contactPerson: "", phone: "", email: "", country: "",
  profitMargin: "", contractRef: "", currency: "SAR", notes: "",
};

export default function UmrahAgents() {
  const [, navigate] = useLocation();
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const items = resp?.data || [];
  const { toast } = useToast();

  // editingId discriminator: null = closed, "new" = create, number = edit row.
  const [editingId, setEditingId] = useState<null | "new" | number>(null);
  const [editingDefaults, setEditingDefaults] = useState<AgentForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const closeDialog = () => setEditingId(null);

  const createMut = useApiMutation<any, any>("/umrah/agents", "POST", [["umrah-agents"]], {
    onSuccess: () => { refetch(); closeDialog(); toast({ title: "تم إضافة الوكيل بنجاح" }); },
  });
  const updateMut = useApiMutation<any, any>(
    () => `/umrah/agents/${typeof editingId === "number" ? editingId : ""}`,
    "PATCH",
    [["umrah-agents"]],
    {
      onSuccess: () => { refetch(); closeDialog(); toast({ title: "تم تحديث الوكيل بنجاح" }); },
    },
  );
  const deleteMut = useApiMutation<any, any>(() => `/umrah/agents/${deleteId}`, "DELETE", [["umrah-agents"]], {
    onSuccess: () => { refetch(); setDeleteId(null); toast({ title: "تم حذف الوكيل" }); },
  });

  function openCreate() {
    setEditingDefaults(emptyForm);
    setEditingId("new");
  }

  function openEdit(agent: any) {
    setEditingDefaults({
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
    setEditingId(agent.id);
  }

  async function handleSubmit(values: AgentForm) {
    const payload = {
      name: values.name,
      contactPerson: values.contactPerson || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      country: values.country || undefined,
      profitMargin: values.profitMargin ? Number(values.profitMargin) : 0,
      contractRef: values.contractRef || undefined,
      currency: values.currency || "SAR",
      notes: values.notes || undefined,
    };
    if (editingId === "new") await createMut.mutateAsync(payload);
    else await updateMut.mutateAsync(payload);
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const activeCount = items.filter((a: any) => a.status === "active").length;
  const kpiCards = [
    { label: "إجمالي الوكلاء", value: items.length, icon: Building2, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "وكلاء نشطون", value: activeCount, icon: Users, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "وكلاء موقوفون", value: items.length - activeCount, icon: Building2, color: "text-status-error-foreground bg-status-error-surface" },
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
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-status-error" /></Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell title="وكلاء العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "الوكلاء" }]}>
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">إدارة وكلاء العمرة</p>
        <GuardedButton perm="umrah:create" onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />إضافة وكيل</GuardedButton>
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
                <p className="text-xs text-muted-foreground">{c.label}</p>
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

      <Dialog open={editingId !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId === "new" ? "إضافة وكيل جديد" : "تعديل الوكيل"}</DialogTitle>
          </DialogHeader>
          <FormShell
            key={String(editingId ?? "closed")}
            schema={agentFormSchema}
            defaultValues={editingDefaults}
            submitLabel={
              createMut.isPending || updateMut.isPending
                ? "جاري الحفظ..."
                : editingId === "new"
                  ? "إنشاء"
                  : "حفظ"
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
            }
            onSubmit={handleSubmit}
          >
            <FormTextField name="name" label="الاسم" required />
            <FormGrid cols={2}>
              <FormTextField name="contactPerson" label="الشخص المسؤول" />
              <FormTextField name="country" label="البلد" />
              <FormPhoneField name="phone" label="الهاتف" />
              <FormEmailField name="email" label="البريد الإلكتروني" />
            </FormGrid>
            <FormGrid cols={3}>
              <FormNumberField name="profitMargin" label="نسبة الربح %" />
              <FormTextField name="contractRef" label="مرجع العقد" />
              <FormTextField name="currency" label="العملة" />
            </FormGrid>
            <FormTextareaField name="notes" label="ملاحظات" rows={2} />
          </FormShell>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p>هل أنت متأكد من حذف هذا الوكيل؟ لا يمكن حذف وكيل مرتبط بمعتمرين.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <GuardedButton perm="umrah:delete" variant="destructive" onClick={() => deleteMut.mutate({})} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </GuardedButton>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
