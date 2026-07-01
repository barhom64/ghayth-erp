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
import { formatDateAr } from "@/lib/formatters";

interface SitePost {
  id: number;
  slug?: string;
  title?: string;
  excerpt?: string;
  status?: string;
  publishedAt?: string;
  sortOrder?: number;
}

export default function WebsitePosts() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SitePost | null>(null);
  const q = useApiQuery<any>(["site-posts"], "/site/posts");
  const rows = asList<SitePost>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/posts/${b.id}`,
    "DELETE",
    [["site-posts"]],
    { successMessage: "تم حذف المقال", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SitePost>[] = [
    {
      key: "title",
      header: "المقال",
      render: (r) => (
        <div>
          <div className="font-medium">{r.title ?? "-"}</div>
          {r.excerpt && <div className="text-xs text-muted-foreground line-clamp-1">{r.excerpt}</div>}
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (r) => (
        <Badge variant={r.status === "published" ? "default" : "outline"}>
          {r.status === "published" ? "منشور" : "مسودة"}
        </Badge>
      ),
    },
    {
      key: "publishedAt",
      header: "تاريخ النشر",
      align: "center",
      render: (r) => (r.publishedAt ? formatDateAr(r.publishedAt) : "-"),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton
            perm="website:update"
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/website/posts/${r.id}/edit`)}
          >
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
      title="المدونة"
      subtitle="مقالات المدونة المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/posts/create")}>
          <Plus className="h-4 w-4 ml-1" /> مقال جديد
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
        onRowClick={(r) => navigate(`/website/posts/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المقال</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteRow?.title}»؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRow && del.mutate({ id: deleteRow.id })}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
