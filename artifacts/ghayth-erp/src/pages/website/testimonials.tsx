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

interface SiteTestimonial {
  id: number;
  authorName?: string;
  authorTitle?: string;
  rating?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsiteTestimonials() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SiteTestimonial | null>(null);
  const q = useApiQuery<any>(["site-testimonials"], "/site/testimonials");
  const rows = asList<SiteTestimonial>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/testimonials/${b.id}`,
    "DELETE",
    [["site-testimonials"]],
    { successMessage: "تم حذف الرأي", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SiteTestimonial>[] = [
    {
      key: "authorName",
      header: "العميل",
      render: (r) => (
        <div>
          <div className="font-medium">{r.authorName ?? "-"}</div>
          {r.authorTitle && <div className="text-xs text-muted-foreground">{r.authorTitle}</div>}
        </div>
      ),
    },
    { key: "rating", header: "التقييم", align: "center", render: (r) => (r.rating ? "★".repeat(r.rating) : "-") },
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
          <GuardedButton perm="website:update" variant="ghost" size="icon" onClick={() => navigate(`/website/testimonials/${r.id}/edit`)}>
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
      title="آراء العملاء"
      subtitle="الشهادات والآراء المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/testimonials/create")}>
          <Plus className="h-4 w-4 ml-1" /> رأي جديد
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
        onRowClick={(r) => navigate(`/website/testimonials/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرأي</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف رأي «{deleteRow?.authorName}»؟ لا يمكن التراجع عن هذا الإجراء.
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
