import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, TrendingDown, Calculator, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

export default function FixedAssetsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showDepreciate, setShowDepreciate] = useState(false);
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [depResult, setDepResult] = useState<any>(null);
  const [batchResult, setBatchResult] = useState<any>(null);

  const { data, isLoading, refetch } = useApiQuery<any>(["fixed-assets"], "/finance/fixed-assets");
  const assets = data?.data || [];

  const createMutation = useApiMutation("/finance/fixed-assets", "POST");
  const depreciateMutation = useApiMutation(
    selectedAsset ? `/finance/fixed-assets/${selectedAsset.id}/depreciate` : "/finance/fixed-assets/0/depreciate",
    "POST"
  );
  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  const [form, setForm] = useState({
    name: "", code: "", category: "", purchaseDate: "", purchaseCost: "", salvageValue: "0",
    usefulLifeYears: "5", depreciationMethod: "straight_line", description: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        ...form,
        purchaseCost: Number(form.purchaseCost),
        salvageValue: Number(form.salvageValue),
        usefulLifeYears: Number(form.usefulLifeYears),
      });
      setShowCreate(false);
      setForm({ name: "", code: "", category: "", purchaseDate: "", purchaseCost: "", salvageValue: "0", usefulLifeYears: "5", depreciationMethod: "straight_line", description: "" });
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleDepreciate() {
    if (!selectedAsset) return;
    try {
      const res = await depreciateMutation.mutateAsync({ period: depPeriod });
      setDepResult(res);
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleBatchDepreciate() {
    try {
      const res = await batchDepMutation.mutateAsync({ period: depPeriod });
      setBatchResult(res);
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  const totalCost = assets.reduce((s: number, a: any) => s + Number(a.purchaseCost ?? 0), 0);
  const totalBookValue = assets.reduce((s: number, a: any) => s + Number(a.currentBookValue ?? 0), 0);
  const totalAccDep = assets.reduce((s: number, a: any) => s + Number(a.accumulatedDepreciation ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-indigo-600" />
          الأصول الثابتة والإهلاك
        </h1>
        <div className="flex gap-2">
          <Link href="/finance/fixed-assets/batch-depreciate">
            <Button variant="outline" size="sm">
              <TrendingDown className="h-4 w-4 me-2" />إهلاك دفعي
            </Button>
          </Link>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 me-1" />أصل جديد
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">التكلفة الإجمالية</p>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(totalCost)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">مجمع الإهلاك</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalAccDep)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">القيمة الدفترية الحالية</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalBookValue)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : assets.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد أصول ثابتة مسجلة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الكود</TableHead>
                    <TableHead>الأصل</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>تاريخ الشراء</TableHead>
                    <TableHead>التكلفة</TableHead>
                    <TableHead>مجمع الإهلاك</TableHead>
                    <TableHead>القيمة الدفترية</TableHead>
                    <TableHead>العمر (سنة)</TableHead>
                    <TableHead>طريقة الإهلاك</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs text-gray-500">{a.code || "-"}</TableCell>
                      <TableCell className="font-semibold">{a.name}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{a.category || "-"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{a.purchaseDate ? formatDateAr(a.purchaseDate) : "-"}</TableCell>
                      <TableCell>{formatCurrency(Number(a.purchaseCost))}</TableCell>
                      <TableCell className="text-red-600">{formatCurrency(Number(a.accumulatedDepreciation ?? 0))}</TableCell>
                      <TableCell className="font-bold text-green-600">{formatCurrency(Number(a.currentBookValue ?? a.purchaseCost))}</TableCell>
                      <TableCell className={!a.usefulLifeYears ? "text-red-500 font-bold" : "text-gray-600"}>
                        {a.usefulLifeYears ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {a.depreciationMethod === "declining_balance" ? "القسط المتناقص" : "القسط الثابت"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={a.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {a.status === "active" ? "نشط" : "متقاعد"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedAsset(a); setDepResult(null); setShowDepreciate(true); }}
                        >
                          <Calculator className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>إضافة أصل ثابت</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>اسم الأصل *</Label>
                    <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>الكود</Label>
                    <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div>
                    <Label>الفئة</Label>
                    <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="مثال: معدات، مباني" />
                  </div>
                  <div>
                    <Label>تاريخ الشراء *</Label>
                    <Input type="date" required value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>تكلفة الشراء (﷼) *</Label>
                    <Input type="number" required min="1" step="0.01" value={form.purchaseCost} onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))} />
                  </div>
                  <div>
                    <Label>قيمة الخردة (﷼)</Label>
                    <Input type="number" min="0" step="0.01" value={form.salvageValue} onChange={e => setForm(f => ({ ...f, salvageValue: e.target.value }))} />
                  </div>
                  <div>
                    <Label>العمر الإنتاجي (سنوات)</Label>
                    <Input type="number" min="1" max="50" value={form.usefulLifeYears} onChange={e => setForm(f => ({ ...f, usefulLifeYears: e.target.value }))} />
                  </div>
                  <div>
                    <Label>طريقة الإهلاك</Label>
                    <Select value={form.depreciationMethod} onValueChange={v => setForm(f => ({ ...f, depreciationMethod: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight_line">القسط الثابت</SelectItem>
                        <SelectItem value="declining_balance">القسط المتناقص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "جارٍ الحفظ..." : "حفظ الأصل"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {showDepreciate && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">إهلاك: {selectedAsset.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div className="flex justify-between"><span>القيمة الدفترية الحالية:</span><span className="font-bold">{formatCurrency(Number(selectedAsset.currentBookValue ?? selectedAsset.purchaseCost))}</span></div>
                <div className="flex justify-between"><span>مجمع الإهلاك:</span><span className="text-red-600">{formatCurrency(Number(selectedAsset.accumulatedDepreciation ?? 0))}</span></div>
                <div className="flex justify-between"><span>طريقة الإهلاك:</span><span>{selectedAsset.depreciationMethod === "declining_balance" ? "متناقص" : "ثابت"}</span></div>
              </div>
              <div>
                <Label>الفترة (YYYY-MM)</Label>
                <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
              </div>
              {depResult && (
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="font-semibold text-green-700 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />تم تسجيل الإهلاك
                  </p>
                  <p className="text-sm mt-1">مبلغ الإهلاك: {formatCurrency(depResult.depreciationAmount)}</p>
                  <p className="text-sm">القيمة الدفترية الجديدة: {formatCurrency(depResult.newBookValue)}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowDepreciate(false); setDepResult(null); }}>إغلاق</Button>
                <Button onClick={handleDepreciate} disabled={depreciateMutation.isPending}>
                  {depreciateMutation.isPending ? "جارٍ الإهلاك..." : "تسجيل الإهلاك"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
