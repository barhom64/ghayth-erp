import { useState } from "react";
import { Link } from "wouter";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RowActions, InlineDeleteConfirm } from "@/components/inline-actions";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatDateAr } from "@/lib/formatters";
import { MessageSquare, Plus } from "lucide-react";

interface WhatsAppTemplate {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  variableCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض", draft: "مسودة",
};
const STATUS_TONE: Record<string, string> = {
  approved: "bg-status-success-surface text-status-success-foreground",
  pending: "bg-status-warning-surface text-status-warning-foreground",
  rejected: "bg-status-error-surface text-status-error-foreground",
  draft: "bg-status-neutral-surface text-status-neutral-foreground",
};
const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "تسويقي", UTILITY: "خدمي", AUTHENTICATION: "مصادقة",
};

export default function WhatsAppTemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ data: WhatsAppTemplate[] }>(
    ["mkt-wa-templates"], "/marketing/whatsapp-templates",
  );
  const rows = asList<WhatsAppTemplate>(data);
  const delMut = useApiMutation<unknown, { id: number }>(
    (b) => `/marketing/whatsapp-templates/${b.id}`, "DELETE", [["mkt-wa-templates"]],
  );

  const handleDelete = async (id: number) => {
    try {
      await delMut.mutateAsync({ id });
      toast({ title: "تم حذف القالب" });
      setDeletingId(null);
      qc.invalidateQueries({ queryKey: ["mkt-wa-templates"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الحذف", description: err?.fix ?? err?.message });
    }
  };

  const columns: DataTableColumn<WhatsAppTemplate>[] = [
    { key: "name", header: "اسم القالب", sortable: true, render: (t) => <span className="font-medium">{t.name}</span> },
    { key: "category", header: "الفئة", render: (t) => <span className="text-muted-foreground">{CATEGORY_LABEL[t.category] || t.category}</span> },
    { key: "language", header: "اللغة", render: (t) => <span className="text-muted-foreground">{t.language === "en" ? "إنجليزي" : "عربي"}</span> },
    { key: "variableCount", header: "المتغيرات", render: (t) => <span>{t.variableCount || 0}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <Badge className={STATUS_TONE[t.status] || ""}>{STATUS_LABEL[t.status] || t.status}</Badge> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (t) => formatDateAr(t.createdAt) },
    {
      key: "actions", header: "إجراءات", align: "end", width: "140px",
      render: (t) => (
        <div className="flex items-center gap-1">
          <Link href={`/marketing/whatsapp-templates/${t.id}/edit`}>
            <Button variant="ghost" size="sm">تعديل</Button>
          </Link>
          <RowActions onDelete={() => setDeletingId(t.id)} deletePerm="marketing:delete" />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="قوالب واتساب المعتمدة"
      subtitle="قوالب الرسائل المعتمدة من Meta المستخدمة في الإرسال الجماعي"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/marketing", label: "التسويق" },
        { label: "قوالب واتساب" },
      ]}
      actions={
        <GuardedButton perm="marketing:create" asChild>
          <Link href="/marketing/whatsapp-templates/create">
            <span className="inline-flex items-center"><Plus className="h-4 w-4 me-1.5" />قالب جديد</span>
          </Link>
        </GuardedButton>
      }
    >
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد قوالب واتساب بعد"
        emptyIcon={<MessageSquare className="h-6 w-6 text-slate-400" />}
        renderRowExtras={(t) =>
          deletingId === t.id ? (
            <InlineDeleteConfirm
              onConfirm={() => handleDelete(t.id)}
              onCancel={() => setDeletingId(null)}
              isPending={delMut.isPending}
              itemName={t.name}
              entityType="whatsapp_template"
              entityId={t.id}
            />
          ) : null
        }
      />
    </PageShell>
  );
}
