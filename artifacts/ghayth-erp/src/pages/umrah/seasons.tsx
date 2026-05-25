import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, apiFetch } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  PageStatusBadge,
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

const seasonSchema = z
  .object({
    title: z.string().min(1, "العنوان مطلوب"),
    startDate: z.string().min(1, "تاريخ البداية مطلوب"),
    endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", path: ["endDate"] },
  );
type SeasonForm = z.infer<typeof seasonSchema>;

const EMPTY: SeasonForm = { title: "", startDate: "", endDate: "" };

export default function UmrahSeasons() {
  const [, navigate] = useLocation();
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const items = resp?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

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
          <CardContent className="p-4">
            <FormShell
              key={formKey}
              schema={seasonSchema}
              defaultValues={EMPTY}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              }
              onSubmit={async (values) => {
                try {
                  await apiFetch("/umrah/seasons", { method: "POST", body: JSON.stringify(values) });
                  toast({ title: "تم إنشاء الموسم" });
                  setShowForm(false);
                  setFormKey((k) => k + 1);
                  refetch();
                } catch {
                  toast({ variant: "destructive", title: "خطأ" });
                }
              }}
            >
              <FormGrid cols={3}>
                <FormTextField name="title" label="العنوان" required />
                <FormDateField name="startDate" label="تاريخ البداية" required />
                <FormDateField name="endDate" label="تاريخ النهاية" required />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} data={items} isLoading={isLoading} isError={isError} error={error} onRowClick={(row) => navigate(`/umrah/seasons/${row.id}`)} />
    </PageShell>
  );
}
