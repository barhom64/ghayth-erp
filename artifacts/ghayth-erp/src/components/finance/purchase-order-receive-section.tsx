import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Package, Plus, X, CheckCircle2 } from "lucide-react";

/**
 * FIN-016 — Goods receipt + 3-way match section embedded on the PO
 * detail page.
 *
 * The backend has had three coordinated endpoints since the purchase
 * lifecycle was hardened:
 *   PATCH /purchase-orders/:id/receive    — record a GRN against a PO
 *   GET   /purchase-orders/:id/receipts   — list past GRNs for a PO
 *   GET   /purchase-orders/:id/match      — 3-way match summary
 *                                            (orderedQty / receivedQty /
 *                                             invoicedQty per line)
 * None of them had a UI consumer; a buyer could approve a PO but had
 * no way to mark it received, so AP could never pay the supplier.
 */

interface MatchLine {
  id: number;
  itemName: string;
  quantity: number | string;
  unitPrice: number | string;
  receivedQty: number | string;
  invoicedQty: number | string;
  canInvoiceQty?: number | string;
  canInvoiceAmount?: number | string;
}
interface MatchResponse {
  po?: { id: number; ref: string; status: string; totalAmount?: number };
  lines: MatchLine[];
  canInvoiceTotal?: number;
}
interface ReceiptRow {
  id: number;
  ref: string;
  receivedAt: string;
  journalId: number | null;
  notes: string | null;
  total: number | string;
  items: Array<{ id: number; poItemId: number; itemName: string; receivedQty: number | string; unitPrice: number | string; lineTotal: number | string }>;
}

export function PurchaseOrderReceiveSection({ poId, poStatus }: { poId: number | string; poStatus: string | undefined }) {
  const [showForm, setShowForm] = useState(false);
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qualityNotes, setQualityNotes] = useState("");
  const [perLineQty, setPerLineQty] = useState<Record<number, string>>({});

  const matchUrl = `/finance/purchase-orders/${poId}/match`;
  const receiptsUrl = `/finance/purchase-orders/${poId}/receipts`;
  const { data: matchData, refetch: refetchMatch } = useApiQuery<MatchResponse>(["po-match", String(poId)], matchUrl);
  const { data: receiptsResp, refetch: refetchReceipts } = useApiQuery<{ data: ReceiptRow[] }>(["po-receipts", String(poId)], receiptsUrl);
  const receipts: ReceiptRow[] = asList(receiptsResp?.data || receiptsResp);

  const receiveMut = useApiMutation<unknown, { receivedDate?: string; qualityNotes?: string; lines: Array<{ poItemId: number; receivedQty: number; notes?: string }> }>(
    () => `/finance/purchase-orders/${poId}/receive`,
    "PATCH",
    [["po-detail", String(poId)], ["po-match", String(poId)], ["po-receipts", String(poId)], ["purchase-orders"]],
    {
      successMessage: "تم تسجيل استلام البضاعة",
      onSuccess: () => {
        setShowForm(false);
        setPerLineQty({});
        setQualityNotes("");
        refetchMatch();
        refetchReceipts();
      },
    },
  );

  const lines = matchData?.lines ?? [];
  const canReceive = poStatus === "approved" || poStatus === "partially_received";
  const remainingTotal = lines.reduce((s, l) => s + Math.max(0, Number(l.quantity) - Number(l.receivedQty)), 0);

  const submit = () => {
    const payload = lines
      .map((l) => {
        const remaining = Math.max(0, Number(l.quantity) - Number(l.receivedQty));
        const raw = perLineQty[l.id] ?? String(remaining);
        const qty = Number(raw) || 0;
        if (qty <= 0) return null;
        return { poItemId: l.id, receivedQty: qty };
      })
      .filter((x): x is { poItemId: number; receivedQty: number } => x !== null);
    if (payload.length === 0) return;
    receiveMut.mutate({
      receivedDate: receivedDate || undefined,
      qualityNotes: qualityNotes.trim() || undefined,
      lines: payload,
    });
  };

  const matchColumns: DataTableColumn<MatchLine>[] = [
    { key: "itemName", header: "الصنف", className: "font-medium" },
    { key: "quantity", header: "المطلوب", render: (l) => Number(l.quantity) },
    { key: "receivedQty", header: "المُستَلم", render: (l) => Number(l.receivedQty) },
    { key: "invoicedQty", header: "المُفوتَر", render: (l) => Number(l.invoicedQty) },
    {
      key: "match",
      header: "حالة المطابقة",
      render: (l) => {
        const ord = Number(l.quantity);
        const rec = Number(l.receivedQty);
        const inv = Number(l.invoicedQty);
        const tone =
          ord === rec && rec === inv ? "text-emerald-600" :
          rec >= ord && inv >= rec ? "text-emerald-600" :
          rec < ord ? "text-amber-600" :
          inv < rec ? "text-status-info-foreground" :
          "text-muted-foreground";
        const label =
          ord === rec && rec === inv ? "مطابقة كاملة 3/3" :
          rec === 0 ? "لم يُستَلم" :
          rec < ord ? "استلام جزئي" :
          inv === 0 ? "بانتظار الفاتورة" :
          inv < rec ? "فاتورة جزئية" :
          "—";
        return <span className={`text-xs font-medium ${tone}`}>{label}</span>;
      },
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> الاستلام والمطابقة الثلاثية</CardTitle>
          {canReceive && !showForm && remainingTotal > 0 && (
            <GuardedButton perm="finance.purchase:update" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 ml-1" /> تسجيل استلام
            </GuardedButton>
          )}
        </CardHeader>
        <CardContent>
          {showForm ? (
            <div className="space-y-3 mb-4 p-3 border rounded-md bg-status-info-surface/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">تاريخ الاستلام</Label>
                  <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">ملاحظات الجودة</Label>
                  <Input value={qualityNotes} onChange={(e) => setQualityNotes(e.target.value)} placeholder="اختياري" className="mt-1" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">حدّد الكمية المستلمة لكل صنف (الافتراضي = الرصيد المتبقّي)</p>
                {lines.map((l) => {
                  const remaining = Math.max(0, Number(l.quantity) - Number(l.receivedQty));
                  if (remaining === 0) return null;
                  return (
                    <div key={l.id} className="grid grid-cols-3 gap-2 items-center text-sm">
                      <div className="col-span-2"><span className="font-medium">{l.itemName}</span> <span className="text-muted-foreground text-xs">(متبقّي {remaining})</span></div>
                      <Input
                        type="number"
                        min={0}
                        max={remaining}
                        dir="ltr"
                        value={perLineQty[l.id] ?? String(remaining)}
                        onChange={(e) => setPerLineQty((p) => ({ ...p, [l.id]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setPerLineQty({}); }}>
                  <X className="h-4 w-4 ml-1" /> إلغاء
                </Button>
                <GuardedButton perm="finance.purchase:update" size="sm" disabled={receiveMut.isPending || remainingTotal === 0} onClick={submit} rateLimitAware>
                  {receiveMut.isPending ? "جاري الحفظ..." : "حفظ الاستلام"}
                </GuardedButton>
              </div>
            </div>
          ) : null}

          <DataTable
            columns={matchColumns}
            data={lines}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد بنود"
          />

          {(matchData?.canInvoiceTotal ?? 0) > 0 && (
            <div className="mt-3 text-sm text-status-info-foreground bg-status-info-surface/40 border border-status-info-surface rounded-md p-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>قابل للفوترة الآن: {formatCurrency(Number(matchData?.canInvoiceTotal ?? 0))}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {receipts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">سجل الاستلامات</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "ref", header: "المرجع", className: "font-mono text-xs" },
                { key: "receivedAt", header: "التاريخ", render: (r) => formatDateAr(r.receivedAt) },
                { key: "items", header: "عدد الأصناف", render: (r) => r.items?.length ?? 0 },
                { key: "total", header: "الإجمالي", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.total || 0))}</span> },
                { key: "journalId", header: "قيد", render: (r) => r.journalId ? <span className="text-status-info-foreground font-mono text-xs">#{r.journalId}</span> : "—" },
              ] satisfies DataTableColumn<ReceiptRow>[]}
              data={receipts}
              pageSize={0}
              noToolbar
              searchPlaceholder={null}
              emptyMessage="لا توجد استلامات"
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
