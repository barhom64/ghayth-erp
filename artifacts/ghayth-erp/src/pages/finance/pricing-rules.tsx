import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Plus, Tags, Calculator, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Rule {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  status: "active" | "inactive";
  validFrom: string | null;
  validTo: string | null;
  logicOp: "AND" | "OR";
}

interface PreviewResp {
  data: {
    price: number;
    basePrice: number;
    discountAmount: number;
    ruleId: number | null;
    ruleName: string | null;
    appliedAction: string | null;
    evaluatedRules: number;
  };
}

export default function PricingRulesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<{ data: Rule[] }>(
    ["pricing-rules"], "/finance/pricing/rules",
  );
  const items = data?.data || [];
  const deleteMut = useApiMutation<{ deleted: boolean }, { id: number }>(
    (b) => `/finance/pricing/rules/${b.id}`,
    "DELETE",
    [["pricing-rules"]],
  );
  const previewMut = useApiMutation<PreviewResp, any>("/finance/pricing/resolve", "POST");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const [form, setForm] = useState({
    clientId: "", clientSegment: "", productId: "", productCategory: "",
    quantity: "1", basePrice: "100",
  });
  const [previewResult, setPreviewResult] = useState<PreviewResp["data"] | null>(null);

  const runPreview = async () => {
    try {
      const res = await previewMut.mutateAsync({
        clientId: form.clientId ? Number(form.clientId) : undefined,
        clientSegment: form.clientSegment || undefined,
        productId: form.productId ? Number(form.productId) : undefined,
        productCategory: form.productCategory || undefined,
        quantity: Number(form.quantity),
        basePrice: Number(form.basePrice),
      });
      setPreviewResult(res.data);
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذر تنفيذ المعاينة" });
    }
  };

  const columns: DataTableColumn<Rule>[] = [
    {
      key: "name", header: "الاسم", sortable: true,
      render: (r) => (
        <Link href={`/finance/pricing-rules/${r.id}/edit`} className="font-medium text-blue-700 hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "priority", header: "الأولوية", sortable: true,
      render: (r) => <Badge variant="outline">{r.priority}</Badge> },
    { key: "logicOp", header: "المنطق",
      render: (r) => <span className="text-xs text-muted-foreground">{r.logicOp}</span> },
    { key: "validity", header: "الصلاحية",
      render: (r) => r.validFrom || r.validTo
        ? <span className="text-xs">{r.validFrom ?? "—"} → {r.validTo ?? "—"}</span>
        : <span className="text-xs text-muted-foreground">دائمة</span> },
    { key: "status", header: "الحالة",
      render: (r) => <Badge variant={r.status === "active" ? "default" : "secondary"}>
        {r.status === "active" ? "مفعّلة" : "موقوفة"}
      </Badge> },
    { key: "_actions", header: "", width: "120px",
      render: (r) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/finance/pricing-rules/${r.id}/edit`)}>تعديل</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDel(r.id)}>حذف</Button>
        </div>
      ) },
  ];

  return (
    <PageShell
      title="قواعد التسعير الديناميكي"
      subtitle="أنشئ قواعد خصم/تسعير حسب العميل والكمية والمنتج والموسم — وطبّق أعلى أولوية تلقائياً"
      actions={
        <Button onClick={() => navigate("/finance/pricing-rules/create")}>
          <Plus className="w-4 h-4 ml-1" /> قاعدة جديدة
        </Button>
      }
    >
      <FinanceTabsNav />

      <Card className="p-4 mb-4 bg-blue-50/40 border-blue-200">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <Calculator className="w-4 h-4" /> معاينة: ماذا لو طبّقت القواعد على...
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3" dir="rtl">
          <Input placeholder="معرف العميل" value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          <Input placeholder="شريحة العميل (vip/regular)" value={form.clientSegment}
            onChange={(e) => setForm({ ...form, clientSegment: e.target.value })} />
          <Input placeholder="معرف المنتج" value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })} />
          <Input placeholder="فئة المنتج" value={form.productCategory}
            onChange={(e) => setForm({ ...form, productCategory: e.target.value })} />
          <Input placeholder="الكمية" type="number" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <Input placeholder="السعر الأساسي" type="number" value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={runPreview} disabled={previewMut.isPending}>
            معاينة السعر
          </Button>
          {previewResult && (
            <div className="flex items-center gap-3 text-sm">
              <span>السعر بعد القاعدة: <strong className="text-green-700">{previewResult.price}</strong></span>
              <TrendingDown className="w-4 h-4 text-amber-600" />
              <span>الخصم: <strong>{previewResult.discountAmount}</strong></span>
              <Badge variant={previewResult.ruleId ? "default" : "secondary"}>
                {previewResult.ruleName ?? "لا توجد قاعدة مطابقة"}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={refetch}>
        <DataTable
          data={items}
          columns={columns}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد قواعد تسعير بعد. ابدأ بإنشاء أول قاعدة لتطبيق الخصومات تلقائياً."
        />
      </PageStateWrapper>

      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف قاعدة التسعير؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يتم تطبيق هذه القاعدة بعد الحذف. سجل التطبيقات السابقة يبقى للتدقيق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDel == null) return;
                try {
                  // as-any-reason: justified-pragmatic - Orval-generated mutation accepts {_path} escape-hatch for dynamic interpolated routes; not in the generated TS payload surface
                  await deleteMut.mutateAsync({ _path: `/finance/pricing/rules/${confirmDel}` } as any);
                  toast({ title: "تم حذف القاعدة" });
                } catch (e: any) {
                  toast({ variant: "destructive", title: e?.message || "تعذر الحذف" });
                } finally { setConfirmDel(null); }
              }}
            >تأكيد الحذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
