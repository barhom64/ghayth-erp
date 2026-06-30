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

interface SiteService {
  id: number;
  slug?: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsiteServices() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SiteService | null>(null);
  const q = useApiQuery<any>(["site-services"], "/site/services");
  const rows = asList<SiteService>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/services/${b.id}`,
    "DELETE",
    [["site-services"]],
    { successMessage: "تم حذف الخدمة", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SiteService>[] = [
    {
      key: "title",
      header: "الخدمة",
      render: (r) => (
        <div>
          <div className="font-medium">{r.title ?? "-"}</div>
          {r.subtitle && <div className="text-xs text-muted-foreground">{r.subtitle}</div>}
        </div>
      ),
    },
    { key: "slug", header: "المعرّف", align: "center", ltr: true, render: (r) => r.slug ?? "-" },
    { key: "sortOrder", header: "الترتيب", align: "center", render: (r) => r.sortOrder ?? "-" },
    {
      key: "isActive",
      header: "الحالة",
      align: "center",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "outline"}>{r.isActive ? "مفعّلة" : "متوقفة"}</Badge>
      ),
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
            onClick={() => navigate(`/website/services/${r.id}/edit`)}
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
      title="الخدمات"
      subtitle="الخدمات المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/services/create")}>
          <Plus className="h-4 w-4 ml-1" /> خدمة جديدة
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
        onRowClick={(r) => navigate(`/website/services/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الخدمة</AlertDialogTitle>
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
