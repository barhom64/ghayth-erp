import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  FormShell,
  FormTextField,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, DollarSign, Clock, Zap, XCircle, MinusCircle } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

const bulkWaiveSchema = z.object({
  reason: z.string().min(1, "سبب الإعفاء مطلوب"),
});

export default function UmrahPenalties() {
  const [, navigate] = useLocation();
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-penalties"], "/umrah/penalties");
  const [filters, setFilters] = useFilters();
  const { toast } = useToast();
  const pageSize = 20;
  const items = resp?.data || [];

  const waiveMutation = useApiMutation<any, { id: number; reason: string }>(
    (body) => `/umrah/penalties/${body.id}/waive`,
    "PATCH",
    [["umrah-penalties"]],
    { successMessage: "تم إعفاء الغرامة بنجاح" }
  );

  // Bulk waive — wired to POST /umrah/penalties/waive-bulk (PR #312).
  // Returns { successCount, successIds, totalWaivedAmount, skipped[], errors[] }
  // so the UI can surface a non-atomic summary instead of a binary toast.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkWaiveMutation = useApiMutation<
    { successCount: number; successIds: number[]; totalWaivedAmount: number; skipped: { id: number; reason: string }[]; errors: { id: number; error: string }[] },
    { penaltyIds: number[]; reason: string }
  >(
    () => "/umrah/penalties/waive-bulk",
    "POST",
    [["umrah-penalties"]],
    // Custom success toast since we render counts from the response.
    { successMessage: false } as any,
  );

  const runPenaltyEngine = async () => {
    try {
      const res = await apiFetch<any>("/umrah/run-penalty-engine", { method: "POST", body: JSON.stringify({}) });
      toast({ title: `تم إنشاء ${res.penaltiesCreated ?? 0} غرامة جديدة` });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "خطأ في تشغيل محرك الغرامات" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filteredItems = items.filter((p: any) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return p.pilgrimName?.toLowerCase().includes(q) || p.passportNumber?.toLowerCase().includes(q) || p.agentName?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = items.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const pendingCount = items.filter((p: any) => p.status === "pending").length;

  const kpiCards = [
    { label: "إجمالي الغرامات", value: items.length, icon: AlertTriangle, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "معلقة", value: pendingCount, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "إجمالي المبالغ (ريال)", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  const handleWaive = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    waiveMutation.mutate({ id, reason: "إعفاء إداري" });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "pilgrimName", header: "المعتمر", render: (p) => <span className="font-medium">{p.pilgrimName}</span> },
    { key: "passportNumber", header: "الجواز" },
    { key: "agentName", header: "الوكيل" },
    { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
    { key: "daysOverstayed", header: "أيام التأخر" },
    { key: "amount", header: "المبلغ (ريال)", render: (p) => <span className="font-bold text-status-error-foreground">{formatCurrency(Number(p.amount))}</span> },
    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "actions" as any,
      header: "إجراءات",
      render: (p) =>
        p.status === "pending" ? (
          <Button variant="ghost" size="sm" className="text-orange-600 gap-1" onClick={(e) => handleWaive(e, p.id)}>
            <XCircle className="h-3.5 w-3.5" />إعفاء
          </Button>
        ) : null,
    },
  ];

  const handleBulkSubmit = async (reason: string) => {
    await new Promise<void>((resolve, reject) => {
      bulkWaiveMutation.mutate(
        { penaltyIds: selectedIds, reason },
        {
          onSuccess: (res) => {
            const parts = [
              `أُعفيت ${res.successCount} غرامة`,
              res.totalWaivedAmount > 0 ? `بمبلغ ${formatCurrency(res.totalWaivedAmount)} ر.س` : null,
              res.skipped.length > 0 ? `تخطّي ${res.skipped.length}` : null,
              res.errors.length > 0 ? `أخطاء ${res.errors.length}` : null,
            ].filter(Boolean);
            toast({ title: parts.join(" • ") });
            setBulkOpen(false);
            setSelectedIds([]);
            resolve();
          },
          onError: () => reject(),
        },
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الغرامات</h1>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="gap-2 text-orange-600 border-orange-300"
              rateLimitAware
            >
              <MinusCircle className="h-4 w-4" />
              إعفاء جماعي ({selectedIds.length})
            </Button>
          )}
          <GuardedButton perm="umrah:approve" variant="outline" onClick={runPenaltyEngine} className="gap-2" rateLimitAware>
            <Zap className="h-4 w-4" />تشغيل محرك الغرامات
          </GuardedButton>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الجواز أو الوكيل...",
          statuses: [
            { value: "pending", label: "معلقة" },
            { value: "invoiced", label: "مفوترة" },
            { value: "paid", label: "مدفوعة" },
            { value: "waived", label: "معفاة" },
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد غرامات"
        emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={pageSize}
        selectable
        onSelectionChange={setSelectedIds}
        onRowClick={(row) => navigate(`/umrah/penalties/${row.id}`)}
      />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إعفاء جماعي للغرامات</DialogTitle>
            <DialogDescription>
              ستُعفى {selectedIds.length} غرامة. الصفوف بحالة "مدفوع" أو "معفاة" تُتخطى تلقائياً.
              قيد عكسي مالي يُرحَّل لكل صف ناجح عبر `postPenaltyWaiverGL` المركزي.
            </DialogDescription>
          </DialogHeader>
          <FormShell
            schema={bulkWaiveSchema}
            defaultValues={{ reason: "" }}
            submitLabel={bulkWaiveMutation.isPending ? "جارٍ الإعفاء..." : "تأكيد الإعفاء"}
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>إلغاء</Button>
            }
            onSubmit={async (values) => {
              await handleBulkSubmit(values.reason.trim());
            }}
          >
            <FormTextField name="reason" label="سبب الإعفاء" placeholder="مثال: قرار إداري" required />
          </FormShell>
        </DialogContent>
      </Dialog>
    </div>
  );
}
