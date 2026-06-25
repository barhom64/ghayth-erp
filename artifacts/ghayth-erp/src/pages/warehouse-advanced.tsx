/**
 * Warehouse advanced operations — wires the 21 wiring-stubs introduced
 * in PR #1377 under /warehouse:
 *
 *   Cycle counts (9): GET /cycle-counts, POST /cycle-counts,
 *     GET /cycle-counts/plans, GET /cycle-counts/:id,
 *     POST /cycle-counts/:id/{approve,submit,post,record}
 *   Lots (5): GET /lots, POST /lots, POST /lots/:id/{qc-approve,qc-reject,recall}
 *   Serials (3): GET /serials, POST /serials, GET /serials/:id
 *   ABC + reports (4): /abc-classification, /reports/cycle-count-accuracy,
 *     /reports/expiring, /reports/lot-aging
 *
 * The backend stubs return empty data today (tables not present in
 * sandbox); the UI renders against the documented shape so a real
 * implementation can swap in without UI changes.
 */

import { useState } from "react";
import { PageShell, DataTable } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { ProductSelect } from "@/components/shared/product-select";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import {
  Calculator, Layers, Hash, BarChart3, FileBarChart, AlertTriangle, Clock,
} from "lucide-react";

export default function WarehouseAdvancedPage() {
  return (
    <PageShell
      title="عمليات المستودع المتقدّمة"
      subtitle="الجرد الدوري، الدفعات (lots)، التسلسلات، تصنيف ABC، تقارير"
      breadcrumbs={[{ label: "المستودع" }, { label: "متقدّم" }]}
    >
      <WarehouseTabsNav />
      <Tabs defaultValue="cycle-counts">
        <TabsList>
          <TabsTrigger value="cycle-counts"><Calculator className="h-3.5 w-3.5 me-1" />الجرد الدوري</TabsTrigger>
          <TabsTrigger value="lots"><Layers className="h-3.5 w-3.5 me-1" />الدفعات</TabsTrigger>
          <TabsTrigger value="serials"><Hash className="h-3.5 w-3.5 me-1" />التسلسلات</TabsTrigger>
          <TabsTrigger value="abc"><BarChart3 className="h-3.5 w-3.5 me-1" />تصنيف ABC</TabsTrigger>
          <TabsTrigger value="reports"><FileBarChart className="h-3.5 w-3.5 me-1" />تقارير</TabsTrigger>
        </TabsList>
        <TabsContent value="cycle-counts"><CycleCountsTab /></TabsContent>
        <TabsContent value="lots"><LotsTab /></TabsContent>
        <TabsContent value="serials"><SerialsTab /></TabsContent>
        <TabsContent value="abc"><AbcTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CycleCountsTab() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Per-line counted-quantity edits keyed by productId, sent in one
  // POST /record batch. Cleared whenever the selection changes.
  const [counts, setCounts] = useState<Record<number, string>>({});

  const listQ = useApiQuery<{ data: any[] }>(
    ["warehouse-cycle-counts"],
    "/warehouse/cycle-counts",
  );
  const items: any[] = listQ.data?.data ?? [];

  const plansQ = useApiQuery<{ data: any[] }>(
    ["warehouse-cycle-count-plans"],
    "/warehouse/cycle-counts/plans",
  );
  const plans: any[] = plansQ.data?.data ?? [];

  const detailQ = useApiQuery<any>(
    ["warehouse-cycle-count", String(selectedId ?? 0)],
    selectedId ? `/warehouse/cycle-counts/${selectedId}` : null,
    !!selectedId,
  );
  const detail = detailQ.data ?? {};
  const lines: any[] = detail.items ?? [];
  const status: string = detail.status ?? "";

  const createMut = useApiMutation<unknown, { planId?: number; warehouseId?: number }>(
    "/warehouse/cycle-counts",
    "POST",
    [["warehouse-cycle-counts"]],
    { successMessage: "تم إنشاء عملية الجرد" },
  );

  const refreshAll = () => { listQ.refetch(); detailQ.refetch(); };

  const saveCounts = async () => {
    const payload = Object.entries(counts)
      .filter(([, v]) => v !== "")
      .map(([pid, v]) => ({ productId: Number(pid), countedQuantity: Number(v) }));
    if (payload.length === 0) {
      toast({ variant: "destructive", title: "أدخل كمية معدودة واحدة على الأقل" });
      return;
    }
    try {
      await apiFetch(`/warehouse/cycle-counts/${selectedId}/record`, {
        method: "POST",
        body: JSON.stringify({ items: payload }),
      });
      toast({ title: `سُجّل العدّ (${payload.length} سطر)` });
      setCounts({});
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل تسجيل العدّ", description: err?.message });
    }
  };

  const action = async (id: number, kind: "approve" | "submit" | "post") => {
    try {
      await apiFetch(`/warehouse/cycle-counts/${id}/${kind}`, { method: "POST" });
      toast({ title: kind === "submit" ? "قُدّمت للمراجعة" : kind === "approve" ? "اعتُمدت" : "رُحّلت الفروق" });
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التنفيذ", description: err?.message });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">عمليات الجرد ({items.length})</CardTitle>
          <GuardedButton
            perm="warehouse:create"
            size="sm"
            rateLimitAware
            onClick={() => createMut.mutate({})}
            disabled={createMut.isPending}
          >
            + جرد جديد
          </GuardedButton>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? <LoadingSpinner /> : listQ.isError ? <ErrorState /> : (
            <div className="divide-y text-xs">
              {items.length === 0 ? (
                <p className="p-3 text-muted-foreground text-center">
                  {listQ.data?.data ? "لا توجد عمليات جرد." : "جدول cycle_counts غير مهيّأ بعد."}
                </p>
              ) : (
                items.map((cc: any) => (
                  <button
                    key={cc.id}
                    type="button"
                    onClick={() => setSelectedId(cc.id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-subtle"
                  >
                    <span className="text-start">
                      <span className="font-mono">#{cc.id}</span>
                      <span className="text-muted-foreground ms-2">{cc.warehouseName ?? "—"}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px]">{cc.status ?? "—"}</Badge>
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الخطط ({plans.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {plansQ.isLoading ? <LoadingSpinner /> : (
            <div className="divide-y text-xs">
              {plans.length === 0 ? (
                <p className="p-3 text-muted-foreground text-center">لا توجد خطط.</p>
              ) : plans.map((p: any) => (
                <div key={p.id} className="px-3 py-2">
                  <span className="font-medium">{p.name ?? `خطة #${p.id}`}</span>
                  {p.frequency && <span className="text-muted-foreground ms-2">{p.frequency}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">تفاصيل عملية #{selectedId}</CardTitle>
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelectedId(null)}>
              إغلاق ×
            </button>
          </CardHeader>
          <CardContent>
            {detailQ.isLoading ? <LoadingSpinner /> : (
              <div className="space-y-3">
                <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
                  {["status", "warehouseName", "scheduledDate", "notes"].map((k) => (
                    <div key={k} className="border rounded p-1.5">
                      <p className="text-muted-foreground text-[10px]">{k}</p>
                      <p className="font-mono">{detail[k] == null ? "—" : String(detail[k])}</p>
                    </div>
                  ))}
                </div>

                {/* Per-line counting editor — editable in pending/in_progress;
                    read-only afterwards. variance/JE stamps show post-trail. */}
                <DataTable<any>
                  noToolbar
                  pageSize={0}
                  data={lines}
                  rowKey={(l: any) => l.id}
                  columns={[
                    { key: "product", header: "الصنف", sortable: false, render: (l: any) => `${l.productName}${l.sku ? ` · ${l.sku}` : ""}` },
                    { key: "systemQuantity", header: "رصيد النظام", sortable: false, align: "center", className: "font-mono", render: (l: any) => Number(l.systemQuantity) },
                    {
                      key: "countedQuantity", header: "الكمية المعدودة", sortable: false, align: "center",
                      render: (l: any) =>
                        ["pending", "in_progress"].includes(status) ? (
                          <Input
                            type="number"
                            min={0}
                            className="h-7 w-24 mx-auto text-center"
                            value={counts[l.productId] ?? (l.countedQuantity == null ? "" : String(Number(l.countedQuantity)))}
                            onChange={(e) => setCounts((c) => ({ ...c, [l.productId]: e.target.value }))}
                          />
                        ) : (
                          <span className="font-mono">{l.countedQuantity == null ? "—" : Number(l.countedQuantity)}</span>
                        ),
                    },
                    { key: "variance", header: "الفرق", sortable: false, align: "center", className: "font-mono", render: (l: any) => (l.countedQuantity == null ? "—" : Number(l.variance)) },
                    { key: "je", header: "قيد التسوية", sortable: false, align: "center", className: "font-mono text-[10px]", render: (l: any) => (l.adjustmentJournalEntryId ? `JE#${l.adjustmentJournalEntryId}` : "—") },
                  ]}
                />

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {["pending", "in_progress"].includes(status) && (
                    <GuardedButton perm="warehouse:update" size="sm" rateLimitAware onClick={saveCounts}>
                      حفظ العدّ
                    </GuardedButton>
                  )}
                  {status === "in_progress" && (
                    <GuardedButton perm="warehouse:update" variant="outline" size="sm" rateLimitAware onClick={() => action(selectedId, "submit")}>
                      تقديم للمراجعة
                    </GuardedButton>
                  )}
                  {status === "reviewed" && (
                    <GuardedButton perm="warehouse:approve" variant="outline" size="sm" rateLimitAware onClick={() => action(selectedId, "approve")}>
                      اعتماد
                    </GuardedButton>
                  )}
                  {status === "approved" && (
                    <GuardedButton perm="warehouse:approve" variant="outline" size="sm" rateLimitAware onClick={() => action(selectedId, "post")}>
                      ترحيل الفروق
                    </GuardedButton>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LotsTab() {
  const { toast } = useToast();
  const listQ = useApiQuery<{ data: any[] }>(["warehouse-lots"], "/warehouse/lots");
  const lots: any[] = listQ.data?.data ?? [];
  const createMut = useApiMutation<unknown, { productId: number; lotNumber: string; quantity?: number }>(
    "/warehouse/lots",
    "POST",
    [["warehouse-lots"]],
    { successMessage: "تم إنشاء الدفعة" },
  );
  const [newLot, setNewLot] = useState("");
  const [lotProductId, setLotProductId] = useState("");
  const [lotQty, setLotQty] = useState("");

  const action = async (id: number, kind: "qc-approve" | "qc-reject" | "recall") => {
    try {
      await apiFetch(`/warehouse/lots/${id}/${kind}`, {
        method: "POST",
        body: kind === "recall" ? JSON.stringify({ reason: "تشغيلية" }) : undefined,
      });
      toast({ title: "تم التنفيذ" });
      listQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل", description: err?.message });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">دفعات الإنتاج ({lots.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <ProductSelect value={lotProductId} onChange={(id) => setLotProductId(id)} stockableOnly placeholder="الصنف" />
          <Input
            value={newLot}
            onChange={(e) => setNewLot(e.target.value)}
            placeholder="رقم الدفعة الجديد"
            className="h-8 text-xs"
          />
          <Input
            type="number"
            min={0}
            value={lotQty}
            onChange={(e) => setLotQty(e.target.value)}
            placeholder="الكمية"
            className="h-8 text-xs"
          />
          <GuardedButton
            perm="warehouse:create"
            size="sm"
            rateLimitAware
            disabled={!newLot || !lotProductId || createMut.isPending}
            onClick={() => {
              createMut.mutate({ productId: Number(lotProductId), lotNumber: newLot, quantity: lotQty ? Number(lotQty) : 0 });
              setNewLot(""); setLotQty("");
            }}
          >
            إضافة
          </GuardedButton>
        </div>
        <div className="divide-y text-xs border rounded">
          {listQ.isLoading ? <LoadingSpinner /> : lots.length === 0 ? (
            <p className="p-3 text-muted-foreground text-center">لا توجد دفعات.</p>
          ) : lots.map((l: any) => (
            <div key={l.id} className="px-3 py-2 flex items-center justify-between">
              <span>
                <span className="font-mono">{l.lotNumber ?? `#${l.id}`}</span>
                {l.productName && <span className="text-muted-foreground ms-2">{l.productName}</span>}
                {l.qcStatus && <Badge variant="outline" className="ms-2 text-[10px]">{l.qcStatus}</Badge>}
              </span>
              <div className="flex gap-1">
                <GuardedButton perm="warehouse:update" variant="ghost" size="sm" rateLimitAware onClick={() => action(l.id, "qc-approve")}>
                  اعتماد QC
                </GuardedButton>
                <GuardedButton perm="warehouse:update" variant="ghost" size="sm" rateLimitAware onClick={() => action(l.id, "qc-reject")}>
                  رفض QC
                </GuardedButton>
                <GuardedButton perm="warehouse:update" variant="ghost" size="sm" rateLimitAware onClick={() => action(l.id, "recall")}>
                  استدعاء
                </GuardedButton>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SerialsTab() {
  const [selectedSerial, setSelectedSerial] = useState<number | null>(null);
  const listQ = useApiQuery<{ data: any[] }>(["warehouse-serials"], "/warehouse/serials");
  const serials: any[] = listQ.data?.data ?? [];
  const detailQ = useApiQuery<any>(
    ["warehouse-serial", String(selectedSerial ?? 0)],
    selectedSerial ? `/warehouse/serials/${selectedSerial}` : null,
    !!selectedSerial,
  );
  const createMut = useApiMutation<unknown, { serialNumber: string; productId: number }>(
    "/warehouse/serials",
    "POST",
    [["warehouse-serials"]],
    { successMessage: "تم إنشاء التسلسل" },
  );
  const [newSerial, setNewSerial] = useState("");
  const [serialProductId, setSerialProductId] = useState("");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">التسلسلات ({serials.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <ProductSelect value={serialProductId} onChange={(id) => setSerialProductId(id)} stockableOnly placeholder="الصنف" />
            <Input
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="رقم التسلسل"
              className="h-8 text-xs font-mono"
              dir="ltr"
            />
            <GuardedButton
              perm="warehouse:create"
              size="sm"
              rateLimitAware
              disabled={!newSerial || !serialProductId || createMut.isPending}
              onClick={() => { createMut.mutate({ serialNumber: newSerial, productId: Number(serialProductId) }); setNewSerial(""); }}
            >
              إضافة
            </GuardedButton>
          </div>
          <div className="divide-y text-xs border rounded">
            {listQ.isLoading ? <LoadingSpinner /> : serials.length === 0 ? (
              <p className="p-3 text-muted-foreground text-center">لا توجد تسلسلات.</p>
            ) : serials.slice(0, 50).map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSerial(s.id)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-subtle"
              >
                <span className="font-mono">{s.serialNumber ?? `#${s.id}`}</span>
                <Badge variant="outline" className="text-[10px]">{s.status ?? "—"}</Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل التسلسل</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedSerial ? (
            <p className="text-xs text-muted-foreground">اختر تسلسلاً من القائمة.</p>
          ) : detailQ.isLoading ? <LoadingSpinner /> : (
            <div className="text-xs grid grid-cols-2 gap-2">
              {Object.entries(detailQ.data ?? {}).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                <div key={k} className="border rounded p-1.5">
                  <p className="text-muted-foreground text-[10px]">{k}</p>
                  <p className="font-mono">{v == null ? "—" : String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AbcTab() {
  const q = useApiQuery<{ data: any[] }>(["warehouse-abc"], "/warehouse/abc-classification");
  const items: any[] = q.data?.data ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">تصنيف ABC للأصناف ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <LoadingSpinner /> : items.length === 0 ? (
          <p className="p-3 text-muted-foreground text-center text-xs">لم يتم حساب تصنيف ABC بعد.</p>
        ) : (
          <div className="divide-y text-xs">
            {items.slice(0, 50).map((it: any, i: number) => (
              <div key={it.id ?? i} className="px-3 py-2 flex items-center justify-between">
                <span className="font-medium">{it.productName ?? it.name ?? `صنف #${it.id ?? i}`}</span>
                <Badge variant="outline" className="text-[10px]">{it.class ?? it.abcClass ?? "—"}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsTab() {
  const accuracyQ = useApiQuery<any>(["warehouse-rep-accuracy"], "/warehouse/reports/cycle-count-accuracy");
  const expiringQ = useApiQuery<{ data: any[] }>(["warehouse-rep-expiring"], "/warehouse/reports/expiring");
  const lotAgingQ = useApiQuery<{ data: any[] }>(["warehouse-rep-lot-aging"], "/warehouse/reports/lot-aging");
  const expiring: any[] = expiringQ.data?.data ?? [];
  const lotAging: any[] = lotAgingQ.data?.data ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />دقّة الجرد
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          {accuracyQ.isLoading ? <LoadingSpinner /> : (
            <div className="space-y-1">
              {Object.entries(accuracyQ.data ?? {}).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono">{v == null ? "—" : String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />الأصناف قاربت الانتهاء ({expiring.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {expiringQ.isLoading ? <LoadingSpinner /> : expiring.length === 0 ? (
            <p className="p-3 text-muted-foreground text-center text-xs">لا أصناف قاربت الانتهاء.</p>
          ) : (
            <div className="divide-y text-xs max-h-48 overflow-y-auto">
              {expiring.slice(0, 30).map((e: any, i: number) => (
                <div key={e.id ?? i} className="px-3 py-1.5 flex justify-between">
                  <span>{e.productName ?? `#${e.id}`}</span>
                  <span className="text-muted-foreground">{e.expiryDate ? formatDateAr(e.expiryDate) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-status-info" />أعمار الدفعات ({lotAging.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lotAgingQ.isLoading ? <LoadingSpinner /> : lotAging.length === 0 ? (
            <p className="p-3 text-muted-foreground text-center text-xs">لا توجد بيانات.</p>
          ) : (
            <div className="divide-y text-xs max-h-48 overflow-y-auto">
              {lotAging.slice(0, 30).map((l: any, i: number) => (
                <div key={l.id ?? i} className="px-3 py-1.5 flex justify-between">
                  <span className="font-mono">{l.lotNumber ?? `#${l.id}`}</span>
                  <span className="text-muted-foreground">{l.ageDays ?? "—"}d</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
