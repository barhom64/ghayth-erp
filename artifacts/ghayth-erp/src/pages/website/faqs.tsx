import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { DataTable, type DataTableColumn, PageShell } from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface SiteFaq {
  id: number;
  question?: string;
  category?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsiteFaqs() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SiteFaq | null>(null);
  const q = useApiQuery<any>(["site-faqs"], "/site/faqs");
  const rows = asList<SiteFaq>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/faqs/${b.id}`,
    "DELETE",
    [["site-faqs"]],
    { successMessage: "تم حذف السؤال", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SiteFaq>[] = [
    { key: "question", header: "السؤال", render: (r) => <div className="font-medium">{r.question ?? "-"}</div> },
    { key: "category", header: "التصنيف", align: "center", render: (r) => r.category ?? "-" },
    { key: "sortOrder", header: "الترتيب", align: "center", render: (r) => r.sortOrder ?? "-" },
    {
      key: "isActive",
      header: "الحالة",
      align: "center",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "outline"}>{r.isActive ? "مفعّل" : "متوقف"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton perm="website:update" variant="ghost" size="icon" onClick={() => navigate(`/website/faqs/${r.id}/edit`)}>
            <Pencil className="h-4 w-4" />
          </GuardedButton>
          <GuardedButton perm="website:delete" variant="ghost" size="icon" onClick={() => setDeleteRow(r)}>
            <Trash2 className="h-4 w-4 text-status-error-foreground" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الأسئلة الشائعة"
      subtitle="الأسئلة والأجوبة المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/faqs/create")}>
          <Plus className="h-4 w-4 ml-1" /> سؤال جديد
        </GuardedButton>
      }
    >
      <DataTable
        columns={columns}
        data={rows}
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        onRetry={() => q.refetch()}
        onRowClick={(r) => navigate(`/website/faqs/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السؤال</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteRow?.question}»؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRow && del.mutate({ id: deleteRow.id })}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
