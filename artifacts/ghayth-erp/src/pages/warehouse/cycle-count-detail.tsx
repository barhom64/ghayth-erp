import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@workspace/ui-core";
import { toast } from "@/hooks/use-toast";
import { formatDateAr, formatNumber } from "@/lib/formatters";

type Line = {
  id: number;
  productId: number;
  productName?: string;
  lotId?: number | null;
  systemQuantity: string | number;
  countedQuantity?: string | number | null;
  variance?: string | number | null;
  varianceValue?: string | number | null;
  reason?: string | null;
};

type Header = {
  id: number;
  warehouseId: number;
  warehouseName?: string;
  scheduledDate: string;
  status: string;
  notes?: string | null;
};


export default function CycleCountDetailPage() {
  const [location] = useLocation();
  const cycleId = Number(location.split("/").pop() ?? 0);

  const { data, refetch } = useApiQuery<any>(["cycle-count", String(cycleId)], `/warehouse/cycle-counts/${cycleId}`);
  const header: Header | undefined = data?.data?.header;
  const lines: Line[] = data?.data?.lines ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(lines);

  const [counted, setCounted] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});

  useEffect(() => {
    const next: Record<number, string> = {};
    const reasonNext: Record<number, string> = {};
    for (const l of lines) {
      if (l.countedQuantity != null) next[l.id] = String(l.countedQuantity);
      if (l.reason) reasonNext[l.id] = l.reason;
    }
    setCounted(next);
    setReasons(reasonNext);
  }, [lines.length]);

  async function saveLines() {
    const inputs = lines.map((l) => {
      const c = counted[l.id];
      return {
        productId: l.productId,
        lotId: l.lotId ?? null,
        systemQuantity: Number(l.systemQuantity),
        countedQuantity: c === "" || c == null ? Number(l.systemQuantity) : Number(c),
        unitCost: 0,
        reason: reasons[l.id] || undefined,
      };
    });
    if (!inputs.length) { toast({ title: "لا توجد أسطر للحفظ", variant: "destructive" }); return; }
    try {
      await apiFetch(`/warehouse/cycle-counts/${cycleId}/record`, {
        method: "POST",
        body: JSON.stringify({ inputs }),
      });
      toast({ title: "تم تسجيل الكميات" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function transition(action: "submit" | "approve" | "post") {
    try {
      await apiFetch(`/warehouse/cycle-counts/${cycleId}/${action}`, { method: "POST" });
      toast({ title: action === "submit" ? "تم الإرسال للمراجعة" : action === "approve" ? "تم الاعتماد" : "تم ترحيل القيد" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  const columns = useMemo<any[]>(() => [
    { key: "productName", header: "المنتج", cell: (r: Line) => r.productName ?? `#${r.productId}` },
    { key: "lotId", header: "دفعة", cell: (r: Line) => r.lotId ? `#${r.lotId}` : "—" },
    { key: "systemQuantity", header: "الكمية بالنظام", cell: (r: Line) => formatNumber(Number(r.systemQuantity)) },
    {
      key: "countedQuantity", header: "الكمية الفعلية",
      cell: (r: Line) => (
        <Input
          type="number" step="0.001" className="w-28"
          disabled={header?.status !== "in_progress" && header?.status !== "pending"}
          value={String(counted[r.id] ?? "")}
          onChange={(e) => setCounted((s) => ({ ...s, [r.id]: e.target.value }))}
        />
      ),
    },
    {
      key: "variance", header: "الفرق",
      cell: (r: Line) => {
        const c = counted[r.id];
        const v = (c === "" || c == null) ? Number(r.variance ?? 0) : Number(c) - Number(r.systemQuantity);
        const cls = v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "";
        return <span className={cls}>{formatNumber(v)}</span>;
      },
    },
    {
      key: "reason", header: "سبب الفرق",
      cell: (r: Line) => (
        <Textarea
          rows={1} className="min-w-[160px]"
          disabled={header?.status !== "in_progress" && header?.status !== "pending"}
          value={reasons[r.id] ?? ""}
          onChange={(e) => setReasons((s) => ({ ...s, [r.id]: e.target.value }))}
        />
      ),
    },
  ], [counted, reasons, header?.status]);

  if (!header) return <PageShell title="جرد دوري"><Card><CardContent className="pt-6">جاري التحميل…</CardContent></Card></PageShell>;

  return (
    <PageShell title={`جرد #${header.id} — ${header.warehouseName ?? `مخزن #${header.warehouseId}`}`}
      actions={
        <PrintButton
          entityType="report_warehouse_cycle_count_detail"
          entityId={String(header.id)}
          size="icon"
          payload={() => ({
            entity: { title: `جرد #${header.id} — ${header.warehouseName ?? `مخزن #${header.warehouseId}`}`, total: printRows.length },
            items: printRows.map((r: any) => {
              const c = counted[r.id];
              const countedVal = (c === "" || c == null) ? (r.countedQuantity ?? "") : c;
              const v = (c === "" || c == null) ? Number(r.variance ?? 0) : Number(c) - Number(r.systemQuantity);
              return {
                "المنتج": r.productName ?? `#${r.productId}`,
                "دفعة": r.lotId ? `#${r.lotId}` : "—",
                "الكمية بالنظام": formatNumber(Number(r.systemQuantity)),
                "الكمية الفعلية": countedVal !== "" && countedVal != null ? formatNumber(Number(countedVal)) : "—",
                "الفرق": formatNumber(v),
                "سبب الفرق": reasons[r.id] ?? r.reason ?? "—",
              };
            }),
          })}
        />
      }
    >
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-4 items-center">
          <div>التاريخ: <strong>{formatDateAr(header.scheduledDate)}</strong></div>
          <div>الحالة: <PageStatusBadge status={header.status} domain="cycle_count" /></div>
          <div className="ms-auto flex gap-2">
            {(header.status === "pending" || header.status === "in_progress") && (
              <Button onClick={saveLines}>حفظ الكميات</Button>
            )}
            {header.status === "in_progress" && (
              <Button variant="outline" onClick={() => transition("submit")}>إرسال للمراجعة</Button>
            )}
            {header.status === "reviewed" && (
              <Button onClick={() => transition("approve")}>اعتماد</Button>
            )}
            {header.status === "approved" && (
              <Button variant="outline" onClick={() => transition("post")}>ترحيل قيد التسوية</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="pt-6">
        <DataTable data={lines} columns={columns} onSortedDataChange={setPrintRows} emptyMessage="لا توجد أسطر بعد" />
      </CardContent></Card>
    </PageShell>
  );
}
