import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormSelectField,
} from "@workspace/ui-core";
import { Users, Split, Merge, ChevronRight } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

const splitSchema = z.object({
  newGroupName: z.string(),
});

const mergeSchema = z.object({
  targetGroupId: z.string().min(1, "اختر مجموعة هدف"),
});

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

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Split state
  const [splitSource, setSplitSource] = useState<Group | null>(null);
  const [splitPilgrimIds, setSplitPilgrimIds] = useState<number[]>([]);
  const sourcePilgrimsQ = useApiQuery<{ data: Pilgrim[] }>(
    ["umrah-pilgrims-by-group", String(splitSource?.id ?? 0)],
    `/umrah/pilgrims?groupId=${splitSource?.id ?? 0}`,
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
  const mergeMutation = useApiMutation<
    { success: boolean; movedCount: number; mergedSourceIds: number[] },
    { sourceGroupIds: number[]; targetGroupId: number }
  >(
    () => "/umrah/groups/merge",
    "POST",
    [["umrah-groups"]],
    { successMessage: false } as any,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleOpenSplit = (g: Group) => {
    if (g.salesInvoiceId) {
      toast({ variant: "destructive", title: "لا يمكن تقسيم مجموعة مفوترة — أصدر إشعار دائن أولاً" });
      return;
    }
    setSplitSource(g);
    setSplitPilgrimIds([]);
  };

  const handleSplitSubmit = async (values: { newGroupName: string }) => {
    if (splitPilgrimIds.length === 0) {
      toast({ variant: "destructive", title: "اختر معتمراً واحداً على الأقل" });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      splitMutation.mutate(
        { pilgrimIds: splitPilgrimIds, newGroupName: values.newGroupName.trim() || undefined },
        {
          onSuccess: (res) => {
            toast({ title: `تم نقل ${res.movedCount} معتمر لمجموعة ${res.newGroup.nuskGroupNumber}` });
            setSplitSource(null);
            resolve();
          },
          onError: () => reject(),
        },
      );
    });
  };

  const handleMergeSubmit = async (values: { targetGroupId: string }) => {
    const targetId = Number(values.targetGroupId);
    if (selectedIds.includes(targetId)) {
      toast({ variant: "destructive", title: "المجموعة الهدف لا يمكن أن تكون ضمن المصادر" });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      mergeMutation.mutate(
        { sourceGroupIds: selectedIds, targetGroupId: targetId },
        {
          onSuccess: (res) => {
            toast({ title: `تم دمج ${res.mergedSourceIds.length} مجموعة (${res.movedCount} معتمر)` });
            setMergeOpen(false);
            setSelectedIds([]);
            resolve();
          },
          onError: () => reject(),
        },
      );
    });
  };

  const columns: DataTableColumn<Group>[] = [
    { key: "nuskGroupNumber", header: "رقم نسك", render: (g) => <span className="font-medium">{g.nuskGroupNumber}</span> },
    { key: "name", header: "الاسم", render: (g) => g.name || "—" },
    { key: "mutamerCount", header: "عدد المعتمرين" },
    { key: "programDuration", header: "المدة (يوم)", render: (g) => g.programDuration ?? "—" },
    { key: "status", header: "الحالة" },
    { key: "createdAt", header: "تاريخ الإنشاء", render: (g) => formatDateAr(g.createdAt) },
    {
      key: "actions" as any,
      header: "إجراءات",
      render: (g) => (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={(e) => { e.stopPropagation(); handleOpenSplit(g); }}
          disabled={!!g.salesInvoiceId}
          rateLimitAware
        >
          <Split className="h-3.5 w-3.5" /> تقسيم
        </Button>
      ),
    },
  ];

  // Merge target options exclude the rows already picked as sources.
  const mergeTargetOptions = items.filter((g) => !selectedIds.includes(g.id) && !g.salesInvoiceId);

  const sourcePilgrims = sourcePilgrimsQ.data?.data ?? [];

  return (
    <div dir="rtl" lang="ar" className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المجموعات</h1>
          <p className="text-sm text-muted-foreground">إدارة مجموعات العمرة — تقسيم ودمج</p>
        </div>
        {selectedIds.length >= 1 && (
          <GuardedButton perm="umrah:approve" onClick={() => setMergeOpen(true)} className="gap-2" rateLimitAware>
            <Merge className="h-4 w-4" />
            دمج المحدد ({selectedIds.length})
          </GuardedButton>
        )}
      </header>

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
        emptyMessage="لا توجد مجموعات"
        selectable
        onSelectionChange={setSelectedIds}
      />

      {/* SPLIT dialog */}
      <AlertDialog open={!!splitSource} onOpenChange={(o) => { if (!o) setSplitSource(null); }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تقسيم المجموعة — {splitSource?.nuskGroupNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              اختر المعتمرين الذين ستنقلهم لمجموعة جديدة. الوكيل + الوكيل الفرعي + الموسم
              ينقل تلقائياً من المصدر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormShell
            key={splitSource?.id ?? "closed"}
            schema={splitSchema}
            defaultValues={{ newGroupName: "" }}
            submitLabel={splitMutation.isPending ? "جاري التقسيم…" : "تأكيد التقسيم"}
            disabled={splitPilgrimIds.length === 0}
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setSplitSource(null)}>إلغاء</Button>
            }
            onSubmit={handleSplitSubmit}
          >
            <FormTextField
              name="newGroupName"
              label="اسم المجموعة الجديدة (اختياري)"
              placeholder={`${splitSource?.name || ""} - تقسيم`}
            />
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
          </FormShell>
        </AlertDialogContent>
      </AlertDialog>

      {/* MERGE dialog */}
      <AlertDialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>دمج {selectedIds.length} مجموعة</AlertDialogTitle>
            <AlertDialogDescription>
              ستنقل كل المعتمرين من المجموعات المحددة إلى مجموعة الهدف، ثم تُحذف المجموعات المصدر (soft delete).
              لا يمكن الدمج إذا كانت أي مجموعة مصدر مفوترة (الخادم سيرفض 409).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormShell
            key={mergeOpen ? "open" : "closed"}
            schema={mergeSchema}
            defaultValues={{ targetGroupId: "" }}
            submitLabel={mergeMutation.isPending ? "جاري الدمج…" : "تأكيد الدمج"}
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>إلغاء</Button>
            }
            onSubmit={handleMergeSubmit}
          >
            <FormSelectField
              name="targetGroupId"
              label="مجموعة الهدف"
              placeholder="اختر مجموعة..."
              required
              options={mergeTargetOptions.map((g) => ({
                value: String(g.id),
                label: `${g.nuskGroupNumber} — ${g.name || "بدون اسم"} (${g.mutamerCount} معتمر)`,
              }))}
            />
          </FormShell>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
