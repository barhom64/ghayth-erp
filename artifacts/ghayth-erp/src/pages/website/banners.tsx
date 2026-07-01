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

interface SiteBanner {
  id: number;
  title?: string;
  ctaLabel?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsiteBanners() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SiteBanner | null>(null);
  const q = useApiQuery<any>(["site-banners"], "/site/banners");
  const rows = asList<SiteBanner>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/banners/${b.id}`,
    "DELETE",
    [["site-banners"]],
    { successMessage: "تم حذف البانر", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SiteBanner>[] = [
    { key: "title", header: "العنوان", render: (r) => <div className="font-medium">{r.title ?? "-"}</div> },
    { key: "ctaLabel", header: "زر الإجراء", align: "center", render: (r) => r.ctaLabel ?? "-" },
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
          <GuardedButton perm="website:update" variant="ghost" size="icon" onClick={() => navigate(`/website/banners/${r.id}/edit`)}>
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
      title="البانرات الإعلانية"
      subtitle="البانرات والحملات الترويجية المعروضة على الموقع"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/banners/create")}>
          <Plus className="h-4 w-4 ml-1" /> بانر جديد
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
        onRowClick={(r) => navigate(`/website/banners/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف البانر</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteRow?.title}»؟ لا يمكن التراجع عن هذا الإجراء.
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
