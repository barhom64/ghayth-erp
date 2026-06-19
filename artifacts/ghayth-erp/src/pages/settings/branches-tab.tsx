import { useState, useEffect, useMemo } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Plus, X, Pencil, Trash2, AlertTriangle, Loader2, ArrowRightLeft } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import {
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api";
import { PrintButton } from "@/components/shared/print-button";
import { BranchForm, type BranchFormValues } from "./branch-form";

export function BranchesTab() {
  const { refreshFilters } = useAppContext();
  const { data: companiesResp, isLoading: companiesLoading, isError: companiesError } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<BranchFormValues | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  const [deletingBranch, setDeletingBranch] = useState<{ id: number; name: string; companyId: number } | null>(null);
  const items = asList(data);
  const filteredItems = filterCompanyId
    ? items.filter((b: any) => b.companyId === filterCompanyId)
    : items;

  const resetForm = () => {
    setEditingId(null);
    setEditingValues(null);
    setShowForm(false);
  };

  const branchColumns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "اسم الفرع",
      sortable: true,
      searchable: true,
      render: (r: any) => (
        <div className="font-medium">
          {r.name}
          {r.nameEn && <span className="text-muted-foreground text-xs me-2 block">{r.nameEn}</span>}
        </div>
      ),
    },
    ...(companies.length > 1
      ? [{
          key: "companyId",
          header: "الشركة",
          sortable: true,
          render: (r: any) => (
            <span className="text-muted-foreground">
              {companies.find((c: any) => c.id === r.companyId)?.name || "-"}
            </span>
          ),
        }]
      : []),
    { key: "city", header: "المدينة", sortable: true, searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.city || "-"}</span> },
    { key: "phone", header: "الهاتف", render: (r: any) => <span className="text-muted-foreground">{r.phone || "-"}</span> },
    {
      key: "actions",
      header: "إجراءات",
      width: "100px",
      render: (r: any) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setDeletingBranch({ id: r.id, name: r.name || "—", companyId: r.companyId })}
            disabled={deleting === r.id}
            title="حذف"
            className="text-status-error hover:text-status-error-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading || companiesLoading) return <DataTable columns={branchColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError || companiesError) return <DataTable columns={branchColumns} data={[]} isError={true} searchPlaceholder={null} noToolbar />;

  const handleEdit = (item: any) => {
    setEditingValues({
      name: item.name || "",
      nameEn: item.nameEn || "",
      city: item.city || "",
      phone: item.phone || "",
      companyId: item.companyId?.toString() || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/settings/branches/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحذف", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building className="h-5 w-5" />
          إدارة الفروع
        </h3>
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_settings_branches"
            entityId="list"
            size="icon"
            label="طباعة قائمة الفروع"
            payload={() => ({
              entity: {
                title: filterCompanyId ? `فروع ${companies.find((c: any) => c.id === filterCompanyId)?.name ?? ""}` : "قائمة الفروع",
                total: filteredItems.length,
              },
              items: filteredItems.map((r: any) => ({
                "اسم الفرع": r.name || "—",
                "بالإنجليزية": r.nameEn || "—",
                "الشركة": companies.find((c: any) => c.id === r.companyId)?.name || "—",
                "المدينة": r.city || "—",
                "الهاتف": r.phone || "—",
              })),
            })}
          />
          <GuardedButton perm="admin:create" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />فرع جديد</>}
          </GuardedButton>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{editingId ? "تعديل الفرع" : "إضافة فرع جديد"}</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchForm
              editingId={editingId}
              initialValues={editingValues ?? undefined}
              onSaved={() => { resetForm(); refetch(); refreshFilters(); }}
              onCancel={resetForm}
            />
          </CardContent>
        </Card>
      )}

      {companies.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">تصفية بالشركة:</Label>
          <select
            className="border rounded-md p-1.5 text-sm"
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">جميع الشركات</option>
            {companies.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <DataTable
        columns={branchColumns}
        data={filteredItems}
        searchPlaceholder="بحث في الفروع..."
        emptyMessage="لا توجد فروع"
        pageSize={0}
      />

      <BranchDeleteDialog
        branch={deletingBranch}
        branches={items}
        onOpenChange={(v) => { if (!v) setDeletingBranch(null); }}
        onDeleted={() => { setDeletingBranch(null); refetch(); refreshFilters(); }}
      />
    </div>
  );
}

// Branch retirement (soft-disable). Unlike the generic ConfirmDeleteDialog,
// a branch sits at the root of many FK relations, so the server refuses to
// disable one that still has active employees or open purchase orders. When
// that happens, the server returns CONFLICT + meta.blockers + canReassign,
// and this dialog lets the operator move that active data to another active
// branch (e.g. the newly-opened one) and retire the old branch in one step.
function BranchDeleteDialog({
  branch,
  branches,
  onOpenChange,
  onDeleted,
}: {
  branch: { id: number; name: string; companyId: number } | null;
  branches: any[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [canReassign, setCanReassign] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [pending, setPending] = useState(false);

  const open = branch !== null;

  useEffect(() => {
    if (open) {
      setBlockers(null);
      setCanReassign(false);
      setReassignTo("");
      setPending(false);
    }
  }, [open, branch?.id]);

  // Candidate destinations: other active branches in the same company.
  const targetOptions = useMemo(
    () =>
      branches.filter(
        (b: any) =>
          b.id !== branch?.id &&
          b.companyId === branch?.companyId &&
          (b.status ?? "active") !== "inactive",
      ),
    [branches, branch],
  );

  const doDelete = async (reassignToBranchId?: number) => {
    if (!branch) return;
    setPending(true);
    try {
      await apiFetch(`/settings/branches/${branch.id}`, {
        method: "DELETE",
        ...(reassignToBranchId
          ? { body: JSON.stringify({ reassignToBranchId }) }
          : {}),
      });
      toast({
        title: "تم التعطيل",
        description: reassignToBranchId
          ? "تم نقل البيانات النشطة وتعطيل الفرع القديم"
          : "تم تعطيل الفرع",
      });
      onDeleted();
    } catch (e: any) {
      const err = e as ApiError;
      const meta = (err?.meta ?? {}) as Record<string, unknown>;
      const list = Array.isArray(meta.blockers)
        ? (meta.blockers as unknown[]).filter(
            (b): b is string => typeof b === "string" && b.length > 0,
          )
        : [];
      if (err?.code === "CONFLICT" && list.length > 0) {
        setBlockers(list);
        setCanReassign(Boolean(meta.canReassign));
      } else {
        toast({
          title: "خطأ",
          description: err?.message || "فشل تعطيل الفرع",
          variant: "destructive",
        });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="max-w-lg">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-error-foreground" />
            تعطيل الفرع &ldquo;{branch?.name}&rdquo;
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1 text-start">
              {!blockers && (
                <p className="text-xs text-muted-foreground">
                  سيتم تعطيل الفرع وإخفاؤه من القوائم، مع الاحتفاظ بكل السجلات
                  التاريخية المرتبطة به. هل تريد المتابعة؟
                </p>
              )}

              {blockers && blockers.length > 0 && (
                <div className="rounded-md border border-status-error-surface bg-status-error-surface p-3">
                  <p className="text-xs font-semibold text-status-error-foreground">
                    لا يمكن تعطيل الفرع — يجب معالجة ما يلي أولاً:
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-status-error-foreground">
                    {blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-status-error-foreground" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blockers && canReassign && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    نقل البيانات النشطة إلى فرع آخر ثم التعطيل:
                  </Label>
                  {targetOptions.length > 0 ? (
                    <select
                      className="w-full border rounded-md p-1.5 text-sm"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                    >
                      <option value="">— اختر الفرع البديل —</option>
                      {targetOptions.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      لا يوجد فرع نشط آخر في نفس الشركة لنقل البيانات إليه — أنشئ
                      فرعاً بديلاً أولاً.
                    </p>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-start gap-2">
          {!blockers ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => doDelete()}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />جاري التعطيل…</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5" />تعطيل الفرع</>
              )}
            </Button>
          ) : (
            canReassign && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => doDelete(Number(reassignTo))}
                disabled={pending || !reassignTo}
                className="gap-1.5"
              >
                {pending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />جاري النقل والتعطيل…</>
                ) : (
                  <><ArrowRightLeft className="h-3.5 w-3.5" />نقل البيانات وتعطيل الفرع</>
                )}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            إلغاء
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
