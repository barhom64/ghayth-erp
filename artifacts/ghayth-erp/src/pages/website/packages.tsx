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
import { formatCurrency } from "@/lib/formatters";

interface SitePackage {
  id: number;
  slug?: string;
  name?: string;
  subtitle?: string;
  price?: number;
  currency?: string;
  durationLabel?: string;
  badge?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsitePackages() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SitePackage | null>(null);
  const q = useApiQuery<any>(["site-packages"], "/site/packages");
  const rows = asList<SitePackage>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/packages/${b.id}`,
    "DELETE",
    [["site-packages"]],
    { successMessage: "تم حذف الباقة", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SitePackage>[] = [
    {
      key: "name",
      header: "الباقة",
      render: (r) => (
        <div>
          <div className="font-medium">{r.name ?? "-"}</div>
          {r.subtitle && <div className="text-xs text-muted-foreground">{r.subtitle}</div>}
        </div>
      ),
    },
    {
      key: "price",
      header: "السعر",
      align: "center",
      render: (r) => (r.price != null ? formatCurrency(r.price) : "-"),
    },
    { key: "durationLabel", header: "المدة", align: "center", render: (r) => r.durationLabel ?? "-" },
    {
      key: "badge",
      header: "الوسم",
      align: "center",
      render: (r) => (r.badge ? <Badge variant="secondary">{r.badge}</Badge> : "-"),
    },
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
            onClick={() => navigate(`/website/packages/${r.id}/edit`)}
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
      title="الباقات"
      subtitle="باقات العمرة المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/packages/create")}>
          <Plus className="h-4 w-4 ml-1" /> باقة جديدة
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
        onRowClick={(r) => navigate(`/website/packages/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الباقة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteRow?.name}»؟ لا يمكن التراجع عن هذا الإجراء.
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
