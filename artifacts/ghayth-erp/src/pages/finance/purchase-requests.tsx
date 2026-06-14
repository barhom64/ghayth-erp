import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Send, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface PurchaseRequestItem {
  id: number;
  productId: number | null;
  description: string | null;
  quantity: number | string;
  unitPrice: number | string;
  totalPrice: number | string;
}

interface PurchaseRequest {
  id: number;
  ref: string;
  status: string;
  totalAmount: number | string;
  createdAt: string;
  notes: string | null;
  requestedBy: number | null;
  requestedByName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  items: PurchaseRequestItem[] | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft:        "مسودة",
  pending:      "بانتظار الاعتماد",
  submitted:    "مُرسل",
  approved:     "معتمد",
  rejected:     "مرفوض",
  returned:     "مُرتجَع",
  converted:    "محوّل إلى PO",
  cancelled:    "ملغي",
};

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-800",
  pending:   "bg-amber-100 text-status-warning-foreground",
  submitted: "bg-blue-100 text-status-info-foreground",
  approved:  "bg-emerald-100 text-emerald-800",
  rejected:  "bg-red-100 text-status-error-foreground",
  returned:  "bg-orange-100 text-orange-800",
  converted: "bg-purple-100 text-purple-800",
  cancelled: "bg-gray-100 text-muted-foreground",
};

export default function PurchaseRequestsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const qs = params.toString();

  const { data, isLoading, isError } = useApiQuery<{ data: PurchaseRequest[]; total: number }>(
    ["purchase-requests", statusFilter],
    `/finance/purchase-requests${qs ? `?${qs}` : ""}`,
  );

  const submitMut = useApiMutation<unknown, { id: number }>(
    (b) => `/finance/purchase-requests/${b.id}/submit`,
    "PATCH",
    [["purchase-requests"]],
  );

  const approveMut = useApiMutation<unknown, { id: number; approved: boolean | string }>(
    (b) => `/finance/purchase-requests/${b.id}/approve`,
    "PATCH",
    [["purchase-requests"]],
  );

  // POST /finance/purchase-requests/:id/convert-to-po — convert an
  // approved PR into a purchase order. POST /:id/convert is the legacy
  // alias kept for back-compat — we expose it as a fallback that the
  // operator can shift-click into when the new flow rejects (e.g.,
  // contract attachment validation that the legacy route doesn't run).
  const convertMut = useApiMutation<unknown, { id: number; expectedDelivery?: string; notes?: string }>(
    (b) => `/finance/purchase-requests/${b.id}/convert-to-po`,
    "POST",
    [["purchase-requests"], ["purchase-orders"]],
    { successMessage: "تم تحويل الطلب إلى أمر شراء" },
  );
  const convertLegacyMut = useApiMutation<unknown, { id: number }>(
    (b) => `/finance/purchase-requests/${b.id}/convert`,
    "POST",
    [["purchase-requests"], ["purchase-orders"]],
    { successMessage: "تم التحويل (المسار القديم)" },
  );

  // Dialog state for the convert-to-PO action — replaces window.prompt
  // so the optional notes field has a proper labeled Textarea.
  const [convertTarget, setConvertTarget] = useState<number | null>(null);
  const [convertNotes, setConvertNotes] = useState("");
  const handleConvert = (id: number, useLegacy = false) => {
    if (useLegacy) {
      convertLegacyMut.mutate({ id });
      return;
    }
    setConvertNotes("");
    setConvertTarget(id);
  };
  const confirmConvert = () => {
    if (convertTarget == null) return;
    const notes = convertNotes.trim() || undefined;
    convertMut.mutate({ id: convertTarget, notes });
    setConvertTarget(null);
  };

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const draftCount     = rows.filter((r) => r.status === "draft").length;
  const pendingCount   = rows.filter((r) => r.status === "pending" || r.status === "submitted").length;
  const approvedCount  = rows.filter((r) => r.status === "approved").length;
  const totalAmount    = rows.reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);

  const handleSubmit = async (id: number) => {
    try {
      await submitMut.mutateAsync({ id });
      toast({ title: "تم إرسال الطلب للاعتماد" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإرسال", description: getErrorMessage(err) });
    }
  };

  const handleApprove = async (id: number, approved: boolean) => {
    try {
      await approveMut.mutateAsync({ id, approved });
      toast({ title: approved ? "تم اعتماد الطلب" : "تم رفض الطلب" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإجراء", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<PurchaseRequest>[] = [
    {
      key: "ref",
      header: "المرجع",
      render: (r) => <span className="font-mono text-xs font-medium">{r.ref}</span>,
    },
    {
      key: "supplierName",
      header: "المورد",
      render: (r) => r.supplierName ?? <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "requestedByName",
      header: "مقدم الطلب",
      render: (r) => r.requestedByName ?? <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "itemsCount",
      header: "البنود",
      render: (r) => (
        <Badge variant="outline" className="text-[10px]">
          {r.items?.length ?? 0}
        </Badge>
      ),
    },
    {
      key: "totalAmount",
      header: "الإجمالي",
      render: (r) => <span className="font-mono text-xs">{formatCurrency(Number(r.totalAmount ?? 0))}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      render: (r) => <span className="text-xs">{formatDateAr(r.createdAt)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge className={`text-[10px] ${STATUS_COLOR[r.status] ?? "bg-gray-100"}`}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "_actions",
      header: "الإجراءات",
      render: (r) => (
        <div className="flex items-center gap-1">
          {r.status === "draft" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => handleSubmit(r.id)} disabled={submitMut.isPending}>
              <Send className="h-3 w-3 me-1" /> إرسال
            </Button>
          )}
          {(r.status === "submitted" || r.status === "pending") && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700"
                onClick={() => handleApprove(r.id, true)} disabled={approveMut.isPending}>
                <CheckCircle2 className="h-3 w-3 me-1" /> اعتماد
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-status-error-foreground"
                onClick={() => handleApprove(r.id, false)} disabled={approveMut.isPending}>
                <XCircle className="h-3 w-3 me-1" /> رفض
              </Button>
            </>
          )}
          {r.status === "approved" && (
            <>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-purple-700"><Link href={`/finance/purchase-orders/create?fromRequestId=${r.id}`}>
                  <ArrowRight className="h-3 w-3 me-1" /> صفحة التحويل
                </Link></Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-purple-700"
                onClick={(e) => handleConvert(r.id, e.shiftKey)}
                disabled={convertMut.isPending || convertLegacyMut.isPending}
                rateLimitAware
                title="تحويل مباشر إلى PO (Shift = المسار القديم)"
              >
                <ArrowRight className="h-3 w-3 me-1" /> تحويل سريع
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="طلبات الشراء (Purchase Requests)"
      subtitle="تدفّق طلب الشراء قبل إصدار أمر الشراء الرسمي — لكل طلب اعتماد ثم تحويل إلى أمر شراء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/purchase-orders", label: "أوامر الشراء" },
        { label: "طلبات الشراء" },
      ]}
      actions={
        <>
          <Link href="/finance/purchase-orders/create">
            <GuardedButton perm="finance:create">
              <Plus className="h-4 w-4 me-1" /> طلب جديد
            </GuardedButton>
          </Link>
          <PrintButton
            entityType="report_finance_purchase_requests"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "طلبات الشراء", total: printRows.length },
              items: printRows.map((r) => ({
                "المرجع": r.ref,
                "مقدم الطلب": r.requestedByName || "—",
                "المورد المقترح": r.supplierName || "—",
                "الإجمالي": Number(r.totalAmount || 0),
                "تاريخ الإنشاء": r.createdAt || "—",
                "عدد الأصناف": Array.isArray(r.items) ? r.items.length : "—",
                "الحالة": STATUS_LABEL[r.status] || r.status,
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> دورة طلب الشراء
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            مسودة → إرسال للاعتماد → اعتماد/رفض → تحويل إلى أمر شراء (PO).
            طلب الشراء قبل PO يسمح بالحوكمة المسبقة (إذا فيه ميزانية / إذا في
            مورد مفضل / ...) قبل الالتزام التعاقدي. الرفض يرجع الطلب لمسوّقه
            للتعديل.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مسودات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(draftCount)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">بانتظار الاعتماد</p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(pendingCount)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">معتمد (جاهز للتحويل)</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(approvedCount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3 text-xs text-muted-foreground">
          إجمالي قيمة الطلبات في النتائج المعروضة:
          <span className="font-mono font-bold ms-2 text-foreground">{formatCurrency(totalAmount)}</span>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">الحالة:</span>
        <Badge variant={statusFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setStatusFilter("")}>الكل ({rows.length})</Badge>
        {Object.keys(STATUS_LABEL).map((s) => {
          const count = rows.filter((r) => r.status === s).length;
          if (count === 0 && statusFilter !== s) return null;
          return (
            <Badge key={s}
              variant={statusFilter === s ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setStatusFilter(s)}>
              {STATUS_LABEL[s]} ({count})
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الطلبات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={30}
            emptyMessage={
              statusFilter
                ? `لا توجد طلبات بحالة "${STATUS_LABEL[statusFilter]}"`
                : "لا توجد طلبات شراء — اضغط 'طلب جديد'"
            }
          />
        </CardContent>
      </Card>
      <Dialog open={convertTarget !== null} onOpenChange={(o) => !o && setConvertTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحويل الطلب إلى أمر شراء</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea
              value={convertNotes}
              onChange={(e) => setConvertNotes(e.target.value)}
              placeholder="…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)}>إلغاء</Button>
            <Button onClick={confirmConvert} disabled={convertMut.isPending} rateLimitAware>تحويل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
