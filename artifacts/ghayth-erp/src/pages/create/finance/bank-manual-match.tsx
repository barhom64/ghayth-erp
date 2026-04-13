import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ArrowRight, Search, Link2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

export default function BankManualMatchPage() {
  const [, params] = useRoute("/finance/bank-reconciliation/manual-match/:batchId/:rowId") as [boolean, { batchId: string; rowId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [jeSearch, setJeSearch] = useState("");
  const [jeResults, setJeResults] = useState<any[]>([]);
  const [jeSearching, setJeSearching] = useState(false);
  const [matchMsg, setMatchMsg] = useState("");

  const { data: batchDetail } = useApiQuery<any>(
    ["bank-batch", params?.batchId],
    params?.batchId ? `/finance/bank-reconciliation/${params.batchId}` : null,
    { enabled: !!params?.batchId }
  );
  const rows = batchDetail?.data?.lines || batchDetail?.lines || [];
  const row = rows.find((r: any) => String(r.id) === params?.rowId);

  const manualMatchMutation = useApiMutation("/finance/bank-reconciliation/manual-match", "POST");

  async function searchJournalLines() {
    if (!jeSearch.trim()) return;
    setJeSearching(true);
    try {
      const res = await apiFetch(`/finance/journal?search=${encodeURIComponent(jeSearch)}&limit=20`);
      setJeResults(res?.data || []);
    } catch {
      setJeResults([]);
    } finally {
      setJeSearching(false);
    }
  }

  async function handleManualMatch(journalLineId: number) {
    try {
      await manualMatchMutation.mutateAsync({
        bankLineId: Number(params?.rowId),
        journalLineId,
      });
      setMatchMsg("تمت المطابقة بنجاح");
      toast({ title: "تمت المطابقة بنجاح" });
      setTimeout(() => setLocation("/finance/bank-reconciliation"), 1500);
    } catch {
      setMatchMsg("حدث خطأ أثناء المطابقة");
      toast({ variant: "destructive", title: "حدث خطأ أثناء المطابقة" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/finance/bank-reconciliation">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">مطابقة يدوية</h1>
          <p className="text-gray-500 text-sm mt-1">
            {row ? `${row.description || `سطر #${row.id}`}` : "تحميل..."}
          </p>
        </div>
      </div>

      {row && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5 text-blue-500" /> بيانات السطر البنكي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-6 text-sm">
              <span>المبلغ: <strong>{formatCurrency(Number(row.amount))}</strong></span>
              <span>النوع: <strong>{row.type === "debit" ? "مدين" : "دائن"}</strong></span>
              <span>التاريخ: <strong>{row.statementDate ? formatDateAr(row.statementDate) : "-"}</strong></span>
              <span>الوصف: <strong>{row.description || "-"}</strong></span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">البحث في القيود المحاسبية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="ابحث بالمرجع أو الوصف..."
              value={jeSearch}
              onChange={e => setJeSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchJournalLines()}
              className="flex-1"
            />
            <Button onClick={searchJournalLines} disabled={jeSearching} variant="outline" className="gap-1">
              <Search className="h-4 w-4" /> بحث
            </Button>
          </div>

          {jeSearching && <p className="text-gray-400 text-sm text-center">جارٍ البحث...</p>}

          {jeResults.length > 0 && (
            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
              <DataTable<any>
                columns={[
                  {
                    key: "ref",
                    header: "المرجع",
                    className: "font-mono text-xs text-blue-600",
                    render: (jl) => jl.jeRef || jl.ref || "-",
                  },
                  {
                    key: "description",
                    header: "الوصف",
                    className: "text-xs",
                    render: (jl) => jl.jeDescription || jl.description || "-",
                  },
                  {
                    key: "date",
                    header: "التاريخ",
                    className: "text-xs text-gray-500",
                    render: (jl) => (jl.jeDate ? formatDateAr(jl.jeDate) : "-"),
                  },
                  {
                    key: "debit",
                    header: "مدين",
                    className: "text-xs",
                    render: (jl) => (jl.debit > 0 ? formatCurrency(Number(jl.debit)) : "-"),
                  },
                  {
                    key: "credit",
                    header: "دائن",
                    className: "text-xs",
                    render: (jl) => (jl.credit > 0 ? formatCurrency(Number(jl.credit)) : "-"),
                  },
                  {
                    key: "actions",
                    header: "",
                    render: (jl) => (
                      <Button size="sm" onClick={() => handleManualMatch(jl.id)} disabled={manualMatchMutation.isPending}>
                        ربط
                      </Button>
                    ),
                  },
                ] as DataTableColumn<any>[]}
                data={jeResults}
                rowKey={(jl) => jl.id}
                rowClassName={() => "hover:bg-blue-50"}
                noToolbar
                pageSize={0}
                emptyMessage="لا توجد نتائج"
              />
            </div>
          )}

          {jeResults.length === 0 && !jeSearching && jeSearch && (
            <p className="text-gray-400 text-sm text-center">لا توجد نتائج</p>
          )}

          {matchMsg && (
            <p className={`text-sm font-medium ${matchMsg.includes("خطأ") ? "text-red-600" : "text-green-600"}`}>
              {matchMsg}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link href="/finance/bank-reconciliation">
          <Button variant="outline">العودة للتسوية البنكية</Button>
        </Link>
      </div>
    </div>
  );
}
