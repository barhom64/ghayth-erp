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
import { Plus, Pencil, Trash2, Star } from "lucide-react";

interface SiteHotel {
  id: number;
  slug?: string;
  name?: string;
  city?: string;
  distanceLabel?: string;
  stars?: number;
  badge?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export default function WebsiteHotels() {
  const [, navigate] = useLocation();
  const [deleteRow, setDeleteRow] = useState<SiteHotel | null>(null);
  const q = useApiQuery<any>(["site-hotels"], "/site/hotels");
  const rows = asList<SiteHotel>(q.data);
  const del = useApiMutation<any, { id: number }>(
    (b) => `/site/hotels/${b.id}`,
    "DELETE",
    [["site-hotels"]],
    { successMessage: "تم حذف الفندق", onSuccess: () => setDeleteRow(null) },
  );

  const columns: DataTableColumn<SiteHotel>[] = [
    {
      key: "name",
      header: "الفندق",
      render: (r) => (
        <div>
          <div className="font-medium">{r.name ?? "-"}</div>
          {r.city && <div className="text-xs text-muted-foreground">{r.city}</div>}
        </div>
      ),
    },
    {
      key: "stars",
      header: "التصنيف",
      align: "center",
      render: (r) => (
        <span className="inline-flex items-center gap-0.5">
          {r.stars ? (
            Array.from({ length: r.stars }).map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            ))
          ) : (
            "-"
          )}
        </span>
      ),
    },
    { key: "distanceLabel", header: "المسافة", align: "center", render: (r) => r.distanceLabel ?? "-" },
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
        <Badge variant={r.isActive ? "default" : "outline"}>{r.isActive ? "مفعّل" : "متوقف"}</Badge>
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
            onClick={() => navigate(`/website/hotels/${r.id}/edit`)}
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
      title="الفنادق"
      subtitle="الفنادق المعروضة على الموقع الإلكتروني"
      actions={
        <GuardedButton perm="website:create" onClick={() => navigate("/website/hotels/create")}>
          <Plus className="h-4 w-4 ml-1" /> فندق جديد
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
        onRowClick={(r) => navigate(`/website/hotels/${r.id}/edit`)}
      />
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفندق</AlertDialogTitle>
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
