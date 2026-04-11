import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, TrendingDown, Save } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

export default function BatchDepreciatePage() {
  const [, setLocation] = useLocation();
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [batchResult, setBatchResult] = useState<any>(null);

  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  async function handleBatchDepreciate() {
    try {
      const res = await batchDepMutation.mutateAsync({ period: depPeriod });
      setBatchResult(res);
    } catch (err: any) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/finance/fixed-assets">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">إهلاك دفعي للأصول</h1>
            <p className="text-gray-500 text-sm mt-1">إهلاك جميع الأصول الثابتة لفترة محددة</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-orange-500" /> بيانات الإهلاك
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Label>الفترة (سنة-شهر)</Label>
            <Input className="mt-1" type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
          </div>
          <Button onClick={handleBatchDepreciate} disabled={batchDepMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {batchDepMutation.isPending ? "جارٍ الإهلاك..." : `إهلاك جميع الأصول — ${depPeriod}`}
          </Button>
          {batchResult && (
            <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-1">
              <p className="font-semibold text-green-700">{batchResult.message}</p>
              <p className="text-sm text-gray-600">معالج: {batchResult.processed} | تخطي: {batchResult.skipped}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/finance/fixed-assets">
          <Button variant="outline">العودة للأصول الثابتة</Button>
        </Link>
      </div>
    </div>
  );
}
