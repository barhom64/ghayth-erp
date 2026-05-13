import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Search, Link2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { CreatePageLayout } from "@/components/create-page-layout";

export default function BankManualMatchPage() {
  const [, params] = useRoute("/finance/bank-reconciliation/manual-match/:batchId/:rowId") as [boolean, { batchId: string; rowId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_bank_manual_match", { jeSearch: "" });
  const { fieldErrors, validate } = useFieldErrors();
  const [jeResults, setJeResults] = useState<any[]>([]);
  const [jeSearching, setJeSearching] = useState(false);
  const [matchMsg, setMatchMsg] = useState("");

  const { data: batchDetail, isLoading, isError } = useApiQuery<any>(
    ["bank-batch", params?.batchId],
    params?.batchId ? `/finance/bank-reconciliation/${params.batchId}` : null,
    { enabled: !!params?.batchId }
  );
  const rows = batchDetail?.data?.lines || batchDetail?.lines || [];
  const row = rows.find((r: any) => String(r.id) === params?.rowId);

  const manualMatchMutation = useApiMutation("/finance/bank-reconciliation/manual-match", "POST");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  async function searchJournalLines() {
    const firstError = validate({
      jeSearch: !form.jeSearch.trim() ? "يرجى إدخال نص للبحث" : null,
    });
    if (firstError) return;
    setJeSearching(true);
    try {
      const res = await apiFetch(`/finance/journal?search=${encodeURIComponent(form.jeSearch)}&limit=20`);
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
      clearDraft();
      toast({ title: "تمت المطابقة بنجاح" });
      setTimeout(() => setLocation("/finance/bank-reconciliation"), 1500);
    } catch (err: any) {
      setMatchMsg("حدث خطأ أثناء المطابقة");
      toast({ variant: "destructive", title: "حدث خطأ أثناء المطابقة", description: err?.message });
    }
  }

  return (
    <CreatePageLayout
      title="مطابقة يدوية"
      subtitle={row ? (row.description || `سطر #${row.id}`) : "تحميل..."}
      backPath="/finance/bank-reconciliation"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-6">
        {row && (
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <Link2 className="h-5 w-5 text-status-info" /> بيانات السطر البنكي
            </h3>
            <div className="bg-surface-subtle p-4 rounded-lg flex flex-wrap gap-6 text-sm">
              <span>المبلغ: <strong>{formatCurrency(Number(row.amount))}</strong></span>
              <span>النوع: <strong>{row.type === "debit" ? "مدين" : "دائن"}</strong></span>
              <span>التاريخ: <strong>{row.statementDate ? formatDateAr(row.statementDate) : "-"}</strong></span>
              <span>الوصف: <strong>{row.description || "-"}</strong></span>
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-base font-semibold mb-3">البحث في القيود المحاسبية</h3>
          <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="ابحث بالمرجع أو الوصف..."
              value={form.jeSearch}
              onChange={e => setForm(f => ({ ...f, jeSearch: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && searchJournalLines()}
              className="flex-1"
            />
            <Button onClick={searchJournalLines} disabled={jeSearching} variant="outline" className="gap-1" rateLimitAware>
              <Search className="h-4 w-4" /> بحث
            </Button>
          </div>

          {jeSearching && <p className="text-muted-foreground text-sm text-center">جارٍ البحث...</p>}

          {jeResults.length > 0 && (
            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
              <DataTable
                columns={[
                  {
                    key: "ref",
                    header: "المرجع",
                    className: "font-mono text-xs text-status-info-foreground",
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
                    className: "text-xs text-muted-foreground",
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
                      <Button size="sm" onClick={() => handleManualMatch(jl.id)} disabled={manualMatchMutation.isPending} rateLimitAware>
                        ربط
                      </Button>
                    ),
                  },
                ] as DataTableColumn<any>[]}
                data={jeResults}
                rowKey={(jl) => jl.id}
                rowClassName={() => "hover:bg-status-info-surface"}
                noToolbar
                pageSize={0}
                emptyMessage="لا توجد نتائج"
              />
            </div>
          )}

          {jeResults.length === 0 && !jeSearching && form.jeSearch && (
            <p className="text-muted-foreground text-sm text-center">لا توجد نتائج</p>
          )}

          {matchMsg && (
            <p className={`text-sm font-medium ${matchMsg.includes("خطأ") ? "text-status-error-foreground" : "text-status-success-foreground"}`}>
              {matchMsg}
            </p>
          )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setLocation("/finance/bank-reconciliation")}>
            العودة للتسوية البنكية
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
