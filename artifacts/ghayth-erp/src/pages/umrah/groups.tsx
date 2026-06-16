import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { DataTable, type DataTableColumn, PageShell, resolveStatus } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Users, Split, Merge, ChevronRight } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatUmrahDate, formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Umrah groups list + split / merge operations.
// Wires the existing /umrah/groups endpoints + the new actions:
//   POST /umrah/groups/:id/split  (PR #312)
//   POST /umrah/groups/merge      (PR #312)
//
// Split: pick a source group, tick pilgrims to move out, name the new
// group. Server rejects (409) if the source is already invoiced.
// Merge: pick N source rows, pick a target from the rest, server moves
// every pilgrim and soft-deletes the empty sources.

interface Group {
  id: number;
  nuskGroupNumber: string;
  name: string | null;
  agentId: number | null;
  subAgentId: number | null;
  seasonId: number | null;
  mutamerCount: number;
  programDuration: number | null;
  status: string;
  salesInvoiceId: number | null;
  createdAt: string;
  // Enriched operational fields — backend joins on every list row.
  agentName?: string | null;
  subAgentName?: string | null;
  seasonTitle?: string | null;
  nuskInvoiceCount?: number;
  nuskCostTotal?: number | string;
  salesInvoiceRef?: string | null;
  salesInvoiceTotal?: number | string | null;
  salesInvoiceStatus?: string | null;
  salesOutstanding?: number | string;
  pilgrimsTotal?: number;
  pilgrimsInside?: number;
  pilgrimsOverstayed?: number;
  visaAtRisk?: number;
}

interface Pilgrim {
  id: number;
  nuskNumber: string;
  fullName: string;
  nationality: string | null;
  groupId: number | null;
}

export default function UmrahGroups() {
  const { toast } = useToast();
  const { data: resp, isLoading, isError } = useApiQuery<{ data: Group[] }>(["umrah-groups"], "/umrah/groups");
  const items = resp?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Split state
  const [splitSource, setSplitSource] = useState<Group | null>(null);
  const [splitName, setSplitName] = useState("");
  const [splitPilgrimIds, setSplitPilgrimIds] = useState<number[]>([]);
  const sourcePilgrimsQ = useApiQuery<{ data: Pilgrim[] }>(
    ["umrah-pilgrims-by-group", String(splitSource?.id ?? 0)],
    splitSource ? `/umrah/pilgrims?groupId=${splitSource.id}` : null,
    { enabled: !!splitSource },
  );
  // GET /umrah/groups/:id — fetch the source group's full metadata
  // (nuskGroupNumber, totals, package …) so the split dialog has the
  // canonical context, not just the row from the list page.
  const sourceGroupQ = useApiQuery<any>(
    ["umrah-group-detail", String(splitSource?.id ?? 0)],
    splitSource ? `/umrah/groups/${splitSource.id}` : null,
    { enabled: !!splitSource },
  );
  const splitMutation = useApiMutation<
    { success: boolean; newGroup: { id: number; nuskGroupNumber: string }; movedCount: number },
    { pilgrimIds: number[]; newGroupName?: string }
  >(
    () => `/umrah/groups/${splitSource?.id}/split`,
    "POST",
    [["umrah-groups"]],
    { successMessage: false } as any,
  );

  // Merge state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const mergeMutation = useApiMutation<
    { success: boolean; movedCount: number; mergedSourceIds: number[] },
    { sourceGroupIds: number[]; targetGroupId: number }
  >(
    () => "/umrah/groups/merge",
    "POST",
    [["umrah-groups"]],
    { successMessage: false } as any,
  );

  // Direct CRUD on /umrah/groups — the page already wraps split + merge
  // (which compose multiple PATCH/INSERT calls under one transaction)
  // but the bare create + delete were missing, so operators couldn't
  // open a brand-new empty group (a common case while planning a
  // future season) or remove an abandoned draft.
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");
  const createGroupMut = useApiMutation<unknown, { name: string }>(
    "/umrah/groups",
    "POST",
    [["umrah-groups"]],
    {
      successMessage: "تم إنشاء المجموعة",
      onSuccess: () => { setCreateOpen(false); setNewGroupName(""); },
    },
  );
  const deleteGroupMut = useApiMutation<unknown, { id: number }>(
    (b) => `/umrah/groups/${b.id}`,
    "DELETE",
    [["umrah-groups"]],
    {
      successMessage: "تم حذف المجموعة",
      onSuccess: () => setDeletingGroup(null),
    },
  );
  // Rename group via PATCH /umrah/groups/:id. The backend accepts a partial
  // payload — we only send fields the user edited (name for now).
  const updateGroupMut = useApiMutation<unknown, { id: number; name: string }>(
    (b) => `/umrah/groups/${b.id}`,
    "PATCH",
    [["umrah-groups"]],
    {
      successMessage: "تم تحديث المجموعة",
      onSuccess: () => { setEditingGroup(null); setEditName(""); },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleOpenSplit = (g: Group) => {
    if (g.salesInvoiceId) {
      toast({ variant: "destructive", title: "لا يمكن تقسيم مجموعة مفوترة — أصدر إشعار دائن أولاً" });
      return;
    }
    setSplitSource(g);
    setSplitName("");
    setSplitPilgrimIds([]);
  };

  const handleSplitSubmit = () => {
    if (splitPilgrimIds.length === 0) {
      toast({ variant: "destructive", title: "اختر معتمراً واحداً على الأقل" });
      return;
    }
    splitMutation.mutate(
      { pilgrimIds: splitPilgrimIds, newGroupName: splitName.trim() || undefined },
      {
        onSuccess: (res) => {
          toast({ title: `تم نقل ${res.movedCount} معتمر لمجموعة ${res.newGroup.nuskGroupNumber}` });
          setSplitSource(null);
        },
      },
    );
  };

  const handleMergeSubmit = () => {
    const targetId = Number(mergeTarget);
    if (!targetId) {
      toast({ variant: "destructive", title: "اختر مجموعة هدف" });
      return;
    }
    if (selectedIds.includes(targetId)) {
      toast({ variant: "destructive", title: "المجموعة الهدف لا يمكن أن تكون ضمن المصادر" });
      return;
    }
    mergeMutation.mutate(
      { sourceGroupIds: selectedIds, targetGroupId: targetId },
      {
        onSuccess: (res) => {
          toast({ title: `تم دمج ${res.mergedSourceIds.length} مجموعة (${res.movedCount} معتمر)` });
          setMergeOpen(false);
          setMergeTarget("");
          setSelectedIds([]);
        },
      },
    );
  };

  const columns: DataTableColumn<Group>[] = [
    { key: "nuskGroupNumber", header: "رقم نسك", render: (g) => <span className="font-medium">{g.nuskGroupNumber}</span> },
    { key: "name", header: "الاسم", render: (g) => g.name || "—" },
    { key: "subAgentName" as any, header: "الوكيل الفرعي", render: (g) => g.subAgentName ?? g.agentName ?? "—" },
    { key: "mutamerCount", header: "معتمرون", render: (g) => (
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium">{g.pilgrimsTotal ?? g.mutamerCount}</span>
        {Number(g.pilgrimsInside ?? 0) > 0 && (
          <Badge variant="outline" className="border-status-success-surface text-status-success-foreground text-[10px]">{g.pilgrimsInside} داخل</Badge>
        )}
        {Number(g.pilgrimsOverstayed ?? 0) > 0 && (
          <Badge variant="destructive" className="text-[10px]">{g.pilgrimsOverstayed} متأخر</Badge>
        )}
      </div>
    ) },
    { key: "nuskCostTotal" as any, header: "تكلفة نسك", render: (g) => (
      <div className="text-xs">
        <div className="font-medium">{formatCurrency(Number(g.nuskCostTotal ?? 0))}</div>
        {Number(g.nuskInvoiceCount ?? 0) > 0 && (
          <div className="text-muted-foreground">{g.nuskInvoiceCount} فاتورة</div>
        )}
      </div>
    ) },
    { key: "salesInvoiceRef" as any, header: "فاتورة المبيعات", render: (g) => g.salesInvoiceRef ? (
      <div className="text-xs">
        <div className="font-mono">{g.salesInvoiceRef}</div>
        <div className="font-medium">{formatCurrency(Number(g.salesInvoiceTotal ?? 0))}</div>
        {Number(g.salesOutstanding ?? 0) > 0 && (
          <Badge variant="outline" className="border-status-warning-surface text-status-warning-foreground text-[10px] mt-0.5">باق {formatCurrency(Number(g.salesOutstanding))}</Badge>
        )}
      </div>
    ) : <span className="text-muted-foreground text-xs">— غير مفوترة</span> },
    { key: "visaAtRisk" as any, header: "التأشيرات", render: (g) => {
      const n = Number(g.visaAtRisk ?? 0);
      if (n === 0) return <span className="text-muted-foreground text-xs">—</span>;
      return <Badge variant="destructive" className="text-[10px]">{n} عاجل</Badge>;
    } },
    { key: "programDuration", header: "المدة", render: (g) => g.programDuration ? `${g.programDuration} يوم` : "—" },
    { key: "status", header: "الحالة" },
    { key: "createdAt", header: "تاريخ الإنشاء", render: (g) => formatUmrahDate(g.createdAt) },
    {
      key: "actions" as any,
      header: "إجراءات",
      render: (g) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="sm" className="gap-1"><Link href={`/umrah/groups/${g.id}`} data-testid={`group-detail-link-${g.id}`}>
              تفاصيل
            </Link></Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => { setEditingGroup(g); setEditName(g.name ?? ""); }}
            disabled={!!g.salesInvoiceId}
            rateLimitAware
          >
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => handleOpenSplit(g)}
            disabled={!!g.salesInvoiceId}
            rateLimitAware
          >
            <Split className="h-3.5 w-3.5" /> تقسيم
          </Button>
          {/* Only allow delete when the group has no pilgrims and no
              invoice — the backend would refuse a non-empty/invoiced
              group anyway, this just hides the unusable button. */}
          {g.mutamerCount === 0 && !g.salesInvoiceId && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-status-error-foreground"
              onClick={() => setDeletingGroup(g)}
              rateLimitAware
            >
              حذف
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Merge target options exclude the rows already picked as sources.
  const mergeTargetOptions = items.filter((g) => !selectedIds.includes(g.id) && !g.salesInvoiceId);

  const sourcePilgrims = sourcePilgrimsQ.data?.data ?? [];

  return (
    <PageShell
      title="المجموعات"
      subtitle="إدارة مجموعات العمرة — تقسيم ودمج"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "المجموعات" }]}
      actions={
        <div className="flex gap-2">
          {selectedIds.length >= 1 && (
            <GuardedButton perm="umrah:approve" onClick={() => setMergeOpen(true)} className="gap-2" rateLimitAware>
              <Merge className="h-4 w-4" />
              دمج المحدد ({selectedIds.length})
            </GuardedButton>
          )}
          <GuardedButton perm="umrah:create" onClick={() => setCreateOpen(true)} className="gap-2" variant="outline" rateLimitAware>
            <Users className="h-4 w-4" />
            مجموعة جديدة
          </GuardedButton>
          <PrintButton
            entityType="report_umrah_groups"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "مجموعات العمرة", total: printRows.length },
              items: printRows.map((g: any) => ({
                "الاسم": g.name || "—",
                "رقم نسك": g.nuskGroupNumber || "—",
                "الوكيل": g.agentName || "—",
                "الموسم": g.seasonName || "—",
                "العدد": g.pilgrimCount ?? 0,
                "الحالة": (g.status && resolveStatus(g.status)?.label) ?? g.status ?? "—",
              })),
            })}
          />
        </div>
      }
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="rounded-md p-2 bg-status-info-surface text-status-info-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">إجمالي المجموعات</div>
            <div className="text-xl font-bold">{items.length}</div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        data={items}
        columns={columns}
        onSortedDataChange={setPrintRows}
        emptyMessage="لا توجد مجموعات"
        selectable
        onSelectionChange={setSelectedIds}
      />

      {/* SPLIT dialog */}
      {/* SPLIT dialog */}
      <ConfirmActionDialog
        open={!!splitSource}
        onOpenChange={(o) => { if (!o) setSplitSource(null); }}
        variant="caution"
        title={`تقسيم المجموعة — ${splitSource?.nuskGroupNumber ?? ""}`}
        description="اختر المعتمرين الذين ستنقلهم لمجموعة جديدة. الوكيل + الوكيل الفرعي + الموسم ينقل تلقائياً من المصدر."
        confirmLabel={splitMutation.isPending ? "جاري التقسيم…" : "تأكيد التقسيم"}
        pending={splitMutation.isPending}
        disabled={splitPilgrimIds.length === 0}
        onConfirm={handleSplitSubmit}
        confirmPerm="umrah:approve"
      >
        <div className="space-y-3 py-2">
          {sourceGroupQ.data && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 grid grid-cols-2 gap-1">
              <span>الوكيل: <span className="font-medium">{sourceGroupQ.data.agentName ?? "—"}</span></span>
              <span>الموسم: <span className="font-medium">{sourceGroupQ.data.seasonName ?? sourceGroupQ.data.season ?? "—"}</span></span>
              <span>عدد المعتمرين: <span className="font-mono">{sourceGroupQ.data.pilgrimsCount ?? "—"}</span></span>
              <span>الباقة: <span className="font-medium">{sourceGroupQ.data.packageName ?? "—"}</span></span>
            </div>
          )}
          <div>
            <Label htmlFor="split-name">اسم المجموعة الجديدة (اختياري)</Label>
            <Input
              id="split-name"
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              placeholder={`${splitSource?.name || ""} - تقسيم`}
            />
          </div>
          <div>
            <Label className="mb-2 inline-block">المعتمرون ({sourcePilgrims.length})</Label>
            {sourcePilgrimsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">جاري التحميل…</p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-1">
                {sourcePilgrims.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا معتمرون في هذه المجموعة</p>
                ) : (
                  sourcePilgrims.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={splitPilgrimIds.includes(p.id)}
                        onCheckedChange={(c) =>
                          setSplitPilgrimIds((prev) => (c ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                        }
                      />
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{p.fullName}</span>
                      <span className="text-muted-foreground">({p.nuskNumber})</span>
                    </label>
                  ))
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              المحدد: {splitPilgrimIds.length} من {sourcePilgrims.length}
            </p>
          </div>
        </div>
      </ConfirmActionDialog>

      {/* MERGE dialog */}
      <ConfirmActionDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        variant="caution"
        title={`دمج ${selectedIds.length} مجموعة`}
        description="ستنقل كل المعتمرين من المجموعات المحددة إلى مجموعة الهدف، ثم تُحذف المجموعات المصدر (soft delete). لا يمكن الدمج إذا كانت أي مجموعة مصدر مفوترة (الخادم سيرفض 409)."
        confirmLabel={mergeMutation.isPending ? "جاري الدمج…" : "تأكيد الدمج"}
        pending={mergeMutation.isPending}
        disabled={!mergeTarget}
        onConfirm={handleMergeSubmit}
        confirmPerm="umrah:approve"
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="merge-target">مجموعة الهدف <span className="text-status-error-foreground">*</span></Label>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger id="merge-target"><SelectValue placeholder="اختر مجموعة..." /></SelectTrigger>
            <SelectContent>
              {mergeTargetOptions.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.nuskGroupNumber} — {g.name || "بدون اسم"} ({g.mutamerCount} معتمر)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmActionDialog>

      {/* Create-new-group dialog */}
      <ConfirmActionDialog
        open={createOpen}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setNewGroupName(""); } }}
        variant="confirm"
        title="مجموعة جديدة"
        description="مجموعة فارغة جاهزة لإضافة المعتمرين. اسم المجموعة اختياري — يُولَّد رقم نسك تلقائياً."
        confirmLabel={createGroupMut.isPending ? "جاري الإنشاء…" : "إنشاء"}
        pending={createGroupMut.isPending}
        onConfirm={() => createGroupMut.mutate({ name: newGroupName })}
        confirmPerm="umrah:create"
      >
        <div className="py-2 space-y-2">
          <Label htmlFor="new-group-name">اسم المجموعة (اختياري)</Label>
          <Input
            id="new-group-name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="مثال: مجموعة شعبان 1"
          />
        </div>
      </ConfirmActionDialog>

      {/* Rename group dialog */}
      <ConfirmActionDialog
        open={!!editingGroup}
        onOpenChange={(o) => { if (!o) { setEditingGroup(null); setEditName(""); } }}
        variant="confirm"
        title="تعديل المجموعة"
        description={editingGroup?.nuskGroupNumber ? `رقم نسك: ${editingGroup.nuskGroupNumber}` : ""}
        confirmLabel={updateGroupMut.isPending ? "جاري الحفظ…" : "حفظ"}
        pending={updateGroupMut.isPending}
        disabled={!editingGroup}
        onConfirm={() => editingGroup && updateGroupMut.mutate({ id: editingGroup.id, name: editName })}
        confirmPerm="umrah:update"
      >
        <div className="py-2 space-y-2">
          <Label htmlFor="edit-group-name">اسم المجموعة</Label>
          <Input
            id="edit-group-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="اسم المجموعة"
          />
        </div>
      </ConfirmActionDialog>

      {/* Per-row delete confirm */}
      <ConfirmActionDialog
        open={!!deletingGroup}
        onOpenChange={(o) => { if (!o) setDeletingGroup(null); }}
        variant="destructive"
        title="حذف المجموعة"
        description={deletingGroup ? `سيتم حذف المجموعة "${deletingGroup.name ?? deletingGroup.nuskGroupNumber}". الإجراء غير قابل للتراجع.` : ""}
        confirmLabel={deleteGroupMut.isPending ? "جاري الحذف…" : "تأكيد الحذف"}
        pending={deleteGroupMut.isPending}
        onConfirm={() => deletingGroup && deleteGroupMut.mutate({ id: deletingGroup.id })}
        confirmPerm="umrah:delete"
      />
    </PageShell>
  );
}
