import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Plus, Package, CheckCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function InventoryCountPage() {
  const [showForm, setShowForm] = useState(false);
  const [expandedCount, setExpandedCount] = useState<number | null>(null);
  const [countItems, setCountItems] = useState<Record<number, any[]>>({});
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ countDate: new Date().toISOString().split("T")[0], notes: "", warehouseLocation: "" });

  const { data, refetch, isLoading, isError } = useApiQuery<any>(["inventory-counts"], "/warehouse/inventory-counts");
  const counts = asList(data?.data || data);

  const { data: products } = useApiQuery<any>(["warehouse-products"], "/warehouse/products?limit=500");
  const productList = asList(products?.data || products);

  const handleCreate = async () => {
    try {
      await apiFetch("/warehouse/inventory-counts", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء جلسة الجرد" });
      setShowForm(false);
      setForm({ countDate: new Date().toISOString().split("T")[0], notes: "", warehouseLocation: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const loadItems = async (countId: number) => {
    if (expandedCount === countId) { setExpandedCount(null); return; }
    try {
      const resp = await fetch(`/api/warehouse/inventory-counts/${countId}/items`, { credentials: "include" });
      const json = await resp.json();
      setCountItems((prev) => ({ ...prev, [countId]: json.data || json }));
      setExpandedCount(countId);
    } catch (e) { toast({ title: "خطأ في جلب العناصر", variant: "destructive" }); }
  };

  const handleSaveItem = async (countId: number, productId: number, systemStock: number) => {
    const key = `${countId}-${productId}`;
    const physical = physicalCounts[key];
    if (physical === undefined || physical === "") { toast({ title: "أدخل الكمية الفعلية", variant: "destructive" }); return; }
    try {
      await apiFetch(`/warehouse/inventory-counts/${countId}/items`, { method: "POST", body: JSON.stringify({ productId, physicalCount: Number(physical) }) });
      const resp = await fetch(`/api/warehouse/inventory-counts/${countId}/items`, { credentials: "include" });
      const json = await resp.json();
      setCountItems((prev) => ({ ...prev, [countId]: json.data || json }));
      toast({ title: "تم حفظ الجرد" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const handleApprove = async (countId: number) => {
    if (!confirm("اعتماد الجرد وتحديث المخزون تلقائياً؟")) return;
    try {
      const res = await apiFetch<any>(`/warehouse/inventory-counts/${countId}/approve`, { method: "POST", body: JSON.stringify({}) });
      // P02-MED2 — the server now returns a `warning` field when one
      // or more GL postings failed (or were skipped due to missing
      // unit cost). Surface it as a destructive-style toast so the
      // accountant doesn't walk away thinking the journal entries
      // are in place when they aren't.
      if (res?.warning) {
        toast({
          variant: "destructive",
          title: `تم اعتماد الجرد — ${res.itemsAdjusted ?? 0} منتج تم تعديله`,
          description: res.warning,
        });
      } else {
        toast({ title: `تم اعتماد الجرد — ${res?.itemsAdjusted ?? 0} منتج تم تعديله` });
      }
      refetch();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">جرد المخزن</h1>
            <p className="text-sm text-gray-500">إجراء جلسات الجرد الدوري ومطابقة المخزون الفعلي</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> جلسة جرد جديدة
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">جلسة جرد جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>تاريخ الجرد</Label>
              <Input type="date" value={form.countDate} onChange={(e) => setForm({ ...form, countDate: e.target.value })} />
            </div>
            <div>
              <Label>موقع المستودع</Label>
              <Input value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} placeholder="اسم المستودع أو القسم" />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2">
              <Button onClick={handleCreate}>بدء الجرد</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {counts.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-gray-400">لا توجد جلسات جرد</CardContent></Card>
        ) : counts.map((count: any) => (
          <Card key={count.id} className={`transition-shadow hover:shadow-md ${count.status === "approved" ? "border-green-200" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${count.status === "approved" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"}`}>
                    {count.status === "approved" ? <CheckCircle className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-medium">جرد {count.countDate?.split("T")[0]}</div>
                    <div className="text-sm text-gray-500">
                      {count.warehouseLocation && `${count.warehouseLocation} · `}
                      {count.conductedByName && `بواسطة: ${count.conductedByName}`}
                    </div>
                    {count.notes && <div className="text-xs text-gray-400">{count.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PageStatusBadge status={count.status} />
                  {count.status !== "approved" && (
                    <Button size="sm" variant="outline" onClick={() => handleApprove(count.id)}>
                      <CheckCircle className="w-3.5 h-3.5 me-1" /> اعتماد
                    </Button>
                  )}
                  <button onClick={() => loadItems(count.id)}>
                    {expandedCount === count.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expandedCount === count.id && (
                <div className="mt-4 border-t pt-3">
                  {count.status !== "approved" && (
                    <div className="mb-3 p-3 bg-blue-50 rounded text-xs text-blue-700">
                      أدخل الكمية الفعلية لكل منتج ثم احفظ — يُحدَّث المخزون عند الاعتماد.
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-start">المنتج</th>
                          <th className="px-3 py-2 text-center">رمز المنتج</th>
                          <th className="px-3 py-2 text-center">المخزون النظامي</th>
                          <th className="px-3 py-2 text-center">الفعلي</th>
                          <th className="px-3 py-2 text-center">الفرق</th>
                          {count.status !== "approved" && <th className="px-3 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {productList.map((p: any) => {
                          const existing = (countItems[count.id] || []).find((i: any) => i.productId === p.id);
                          const key = `${count.id}-${p.id}`;
                          const physVal = physicalCounts[key] ?? (existing ? String(existing.physicalCount) : "");
                          const sysStock = existing?.systemStock ?? p.currentStock;
                          const variance = existing?.variance ?? (physVal !== "" ? Number(physVal) - Number(sysStock) : null);
                          return (
                            <tr key={p.id} className={`hover:bg-gray-50 ${variance !== null && variance !== 0 ? (variance > 0 ? "bg-green-50/50" : "bg-red-50/50") : ""}`}>
                              <td className="px-3 py-1.5">{p.name}</td>
                              <td className="px-3 py-1.5 text-center text-gray-400">{p.sku || "—"}</td>
                              <td className="px-3 py-1.5 text-center font-medium">{sysStock}</td>
                              <td className="px-3 py-1.5 text-center">
                                {count.status === "approved"
                                  ? existing ? existing.physicalCount : "—"
                                  : (
                                    <Input
                                      type="number"
                                      min="0"
                                      className="h-7 w-20 text-center mx-auto"
                                      value={physVal}
                                      onChange={(e) => setPhysicalCounts((prev) => ({ ...prev, [key]: e.target.value }))}
                                    />
                                  )
                                }
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                {variance !== null && (
                                  <span className={`flex items-center justify-center gap-0.5 font-medium ${variance > 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-gray-400"}`}>
                                    {variance > 0 ? <ArrowUp className="w-3 h-3" /> : variance < 0 ? <ArrowDown className="w-3 h-3" /> : null}
                                    {Math.abs(variance)}
                                  </span>
                                )}
                              </td>
                              {count.status !== "approved" && (
                                <td className="px-3 py-1.5">
                                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleSaveItem(count.id, p.id, sysStock)}>
                                    حفظ
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
