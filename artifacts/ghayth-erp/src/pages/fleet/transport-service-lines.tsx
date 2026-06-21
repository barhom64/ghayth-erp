/**
 * #2140 بند 8 — طابور تسعير بنود خدمة النقل
 *
 * GET  /transport/service-lines             — قائمة البنود مع فلاتر
 * PATCH /transport/service-lines/:id        — تعديل سعر/حالة
 * POST  /transport/service-lines/:id/auto-price — تسعير تلقائي
 * POST  /transport/invoice-batches          — إنشاء دفعة فوترة
 */
import { useState } from "react";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Zap, FileText, CheckSquare, X } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  ready_for_accounting: "جاهز للمحاسبة",
  under_review: "قيد المراجعة",
  invoiced: "مفوتر",
  excluded: "مستبعد",
};

const UOM_LABELS: Record<string, string> = {
  kg: "كجم", tonne: "طن", pax: "راكب", trip: "رحلة",
  km: "كم", hour: "ساعة", day: "يوم", pallet: "بالت", carton: "كرتون",
};

type ServiceLine = {
  id: number;
  serviceType: string;
  serviceDate: string;
  customerName: string;
  customerId: number;
  quantity: string;
  unitPrice: string | null;
  unitOfMeasure: string;
  lineTotal: string | null;
  billingStatus: string;
  routeFrom: string | null;
  routeTo: string | null;
  notes: string | null;
};

export default function TransportServiceLines() {
  const { toast } = useToast();

  // Filters
  const [statusFilter, setStatusFilter] = useState("ready_for_accounting");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Selection for batch invoice
  const [selected, setSelected] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCustomerId, setBatchCustomerId] = useState<number | null>(null);

  // Inline edit for single line
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [autopriceLoading, setAutopriceLoading] = useState<number | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const qs = new URLSearchParams();
  if (statusFilter) qs.set("status", statusFilter);
  if (fromDate) qs.set("fromDate", fromDate);
  if (toDate) qs.set("toDate", toDate);

  const { data: resp, refetch } = useApiQuery<{ data: ServiceLine[] }>(
    ["transport-service-lines", statusFilter, fromDate, toDate],
    `/transport/service-lines?${qs}`,
  );
  const lines: ServiceLine[] = resp?.data || [];

  const autoPrice = async (id: number) => {
    setAutopriceLoading(id);
    try {
      await apiFetch(`/transport/service-lines/${id}/auto-price`, { method: "POST" });
      toast({ title: "تم التسعير التلقائي" });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التسعير التلقائي", description: getErrorMessage(err) });
    } finally {
      setAutopriceLoading(null);
    }
  };

  const saveLine = async (id: number) => {
    setSaveLoading(true);
    try {
      await apiFetch(`/transport/service-lines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ unitPrice: Number(editPrice) }),
      });
      toast({ title: "تم تحديث السعر" });
      setEditingId(null);
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    } finally {
      setSaveLoading(false);
    }
  };

  const toggleSelect = (id: number, customerId: number) => {
    if (selected.includes(id)) {
      setSelected(s => s.filter(x => x !== id));
      if (selected.length === 1) setBatchCustomerId(null);
    } else {
      // All selected must be same customer
      if (batchCustomerId !== null && batchCustomerId !== customerId) {
        toast({ variant: "destructive", title: "يجب أن تكون جميع البنود لنفس العميل" });
        return;
      }
      setSelected(s => [...s, id]);
      setBatchCustomerId(customerId);
    }
  };

  const createBatch = async () => {
    if (!selected.length || !batchCustomerId) return;
    setBatchLoading(true);
    try {
      const res = await apiFetch<{ invoiceId: number; ref: string; lineCount: number; total: number }>(
        "/transport/invoice-batches",
        {
          method: "POST",
          body: JSON.stringify({ serviceLineIds: selected, customerId: batchCustomerId }),
        },
      );
      toast({
        title: "تم إنشاء فاتورة النقل",
        description: `فاتورة ${res.ref} — ${res.lineCount} بند بإجمالي ${formatCurrency(res.total)} (مسودة بانتظار الاعتماد)`,
      });
      setSelected([]);
      setBatchCustomerId(null);
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل إنشاء الدفعة", description: getErrorMessage(err) });
    } finally {
      setBatchLoading(false);
    }
  };

  const columns: DataTableColumn<ServiceLine>[] = [
    {
      key: "select",
      header: "",
      render: (row) => row.billingStatus === "ready_for_accounting" || row.billingStatus === "under_review" ? (
        <input
          type="checkbox"
          checked={selected.includes(row.id)}
          onChange={() => toggleSelect(row.id, row.customerId)}
          className="rounded"
        />
      ) : null,
    },
    { key: "id", header: "رقم", ltr: true, render: (row) => <span className="font-mono text-xs text-muted-foreground">#{row.id}</span> },
    { key: "serviceDate", header: "التاريخ", render: (row) => formatDateAr(row.serviceDate) },
    { key: "customerName", header: "العميل", render: (row) => <span className="font-medium">{row.customerName || `عميل #${row.customerId}`}</span> },
    { key: "serviceType", header: "نوع الخدمة", render: (row) => <Badge variant="outline">{row.serviceType}</Badge> },
    {
      key: "route",
      header: "المسار",
      render: (row) => row.routeFrom ? (
        <span className="text-xs text-muted-foreground">{row.routeFrom} → {row.routeTo || "—"}</span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "quantity",
      header: "الكمية",
      ltr: true,
      render: (row) => <span className="font-mono">{Number(row.quantity).toFixed(2)} {UOM_LABELS[row.unitOfMeasure] || row.unitOfMeasure}</span>,
    },
    {
      key: "unitPrice",
      header: "سعر الوحدة",
      render: (row) => editingId === row.id ? (
        <div className="flex gap-1 items-center">
          <Input
            type="number"
            className="h-7 w-24 text-xs"
            value={editPrice}
            onChange={e => setEditPrice(e.target.value)}
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveLine(row.id)} disabled={saveLoading}>حفظ</Button>
          <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
        </div>
      ) : (
        <button
          className="text-sm font-mono hover:underline text-start"
          onClick={() => { setEditingId(row.id); setEditPrice(row.unitPrice || ""); }}
        >
          {row.unitPrice ? formatCurrency(Number(row.unitPrice)) : <span className="text-status-error-foreground text-xs">بلا سعر</span>}
        </button>
      ),
    },
    {
      key: "lineTotal",
      header: "الإجمالي",
      render: (row) => row.lineTotal ? (
        <span className="font-bold">{formatCurrency(Number(row.lineTotal))}</span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    { key: "billingStatus", header: "الحالة", render: (row) => <Badge variant="outline">{STATUS_LABELS[row.billingStatus] || row.billingStatus}</Badge> },
    {
      key: "actions",
      header: "",
      render: (row) => row.billingStatus !== "invoiced" && row.billingStatus !== "excluded" ? (
        <GuardedButton
          perm="finance.transport_billing:approve"
          size="sm"
          variant="outline"
          className="gap-1 text-xs h-7"
          onClick={() => autoPrice(row.id)}
          disabled={autopriceLoading === row.id}
        >
          <Zap className="w-3 h-3" />
          {autopriceLoading === row.id ? "..." : "تسعير تلقائي"}
        </GuardedButton>
      ) : null,
    },
  ];

  const totalSelected = lines
    .filter(l => selected.includes(l.id))
    .reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);

  return (
    <PageShell
      title="طابور تسعير بنود النقل"
      subtitle="مراجعة وتسعير وفوترة بنود خدمة النقل"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/service-lines", label: "بنود الخدمة" },
      ]}
    >
      <FleetTabsNav />
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">الحالة</p>
          <Select value={statusFilter || "_all"} onValueChange={v => setStatusFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">— الكل —</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">من تاريخ</p>
          <Input type="date" className="h-9 w-36" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">إلى تاريخ</p>
          <Input type="date" className="h-9 w-36" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {/* Batch invoice bar */}
      {selected.length > 0 && (
        <Card className="border-status-warning-surface bg-status-warning-surface">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-status-warning-foreground" />
              <div>
                <p className="text-sm font-medium">{selected.length} بند محدد — إجمالي: {formatCurrency(totalSelected)}</p>
                <p className="text-xs text-muted-foreground">جميع البنود لعميل واحد. أنشئ دفعة فوترة موحدة.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setSelected([]); setBatchCustomerId(null); }}>
                إلغاء التحديد
              </Button>
              <GuardedButton
                perm="finance.transport_billing:approve"
                size="sm"
                className="gap-1"
                onClick={createBatch}
                disabled={batchLoading}
              >
                <FileText className="w-4 h-4" />
                {batchLoading ? "جارٍ الإنشاء..." : "إنشاء فاتورة مجمعة"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> بنود الخدمة ({lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={lines}
            searchPlaceholder="بحث بالعميل أو نوع الخدمة..."
            pageSize={50}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
