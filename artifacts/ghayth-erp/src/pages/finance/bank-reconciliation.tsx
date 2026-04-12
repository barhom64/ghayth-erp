import { useState, useRef } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Upload, CheckCircle, XCircle, RefreshCw, Landmark, Link2 } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

export default function BankReconciliationPage() {
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [accountCode, setAccountCode] = useState("1120");
  const [importing, setImporting] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);


  const { data: cashBankAccounts } = useApiQuery<any>(["coa-cash-bank"], "/finance/accounts?type=asset&search=11");
  const bankAccOptions = (cashBankAccounts?.data || []).filter((a: any) => {
    const code = String(a.code);
    return code.startsWith("11") && code.length >= 4;
  });

  const { data: batchesList, refetch: refetchBatches } = useApiQuery<any>(["bank-batches"], "/finance/bank-reconciliation");
  const batches = batchesList?.data || [];

  const { data: batchDetail, refetch: refetchDetail } = useApiQuery<any>(
    ["bank-batch", activeBatch ?? ""],
    activeBatch ? `/finance/bank-reconciliation/${activeBatch}` : "",
    { enabled: !!activeBatch }
  );

  const importMutation = useApiMutation("/finance/bank-reconciliation/import", "POST");
  const autoMatchMutation = useApiMutation("/finance/bank-reconciliation/auto-match", "POST");

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseCSV(text: string): any[] {
    const lines = text.trim().replace(/\r\n/g, "\n").split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]!).map(h => h.toLowerCase());
    return lines.slice(1).map(line => {
      const vals = parseCSVLine(line);
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportSuccess("");
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setImportError("الملف لا يحتوي على بيانات"); setImporting(false); return; }
      const result = await importMutation.mutateAsync({ rows, accountCode, statementDate: new Date().toISOString().split("T")[0] });
      setImportSuccess(`تم استيراد ${result.imported} سطر — رقم الدفعة: ${result.batchId}`);
      setActiveBatch(result.batchId);
      refetchBatches();
    } catch (err: any) {
      setImportError(err?.message ?? "خطأ في الاستيراد");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAutoMatch() {
    if (!activeBatch) return;
    setAutoMatching(true);
    try {
      await autoMatchMutation.mutateAsync({ batchId: activeBatch, accountCode });
      refetchDetail();
    } catch (err: any) {
      console.error(err);
    } finally {
      setAutoMatching(false);
    }
  }


  const detail = batchDetail;
  const rows = detail?.rows || [];
  const matchedRows = rows.filter((r: any) => r.matchStatus === "matched");
  const unmatchedRows = rows.filter((r: any) => r.matchStatus !== "matched");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="h-6 w-6 text-blue-600" />
          التسوية البنكية
        </h1>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">استيراد كشف بنكي </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>الحساب البنكي</Label>
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {bankAccOptions.length > 0 ? bankAccOptions.map((a: any) => (
                    <SelectItem key={a.code} value={a.code}>{a.code} - {a.name}</SelectItem>
                  )) : (
                    <>
                      <SelectItem value="1120">1120 - البنك</SelectItem>
                      <SelectItem value="1110">1110 - الصندوق</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملف جدولي</Label>
              <div className="flex gap-2 mt-1">
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFileImport} className="hidden" />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="flex-1">
                  <Upload className="h-4 w-4 me-2" />
                  {importing ? "جارٍ الاستيراد..." : "اختر ملف جدولي"}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">الأعمدة المتوقعة: date, description, debit, credit (أو amount)</p>
            </div>
            {importError && <p className="text-red-600 text-sm">{importError}</p>}
            {importSuccess && <p className="text-green-600 text-sm">{importSuccess}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">الدفعات المستوردة</CardTitle></CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">لا توجد دفعات</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {batches.map((b: any) => (
                  <button
                    key={b.batchId}
                    onClick={() => setActiveBatch(b.batchId)}
                    className={`w-full text-right p-2 rounded border hover:bg-gray-50 transition-colors ${activeBatch === b.batchId ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-blue-600">{b.batchId}</span>
                      <Badge variant="outline">{b.accountCode}</Badge>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500">{b.fromDate} → {b.toDate}</span>
                      <span className="text-xs">
                        <span className="text-green-600">{b.matched}</span>/{b.total} متطابق
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {activeBatch && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-3">
              <Card><CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">الإجمالي</p>
                <p className="text-xl font-bold">{detail?.summary?.total ?? 0}</p>
              </CardContent></Card>
              <Card className="border-green-200 bg-green-50"><CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">متطابق</p>
                <p className="text-xl font-bold text-green-600">{detail?.summary?.matchedCount ?? 0}</p>
              </CardContent></Card>
              <Card className="border-red-200 bg-red-50"><CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">غير متطابق</p>
                <p className="text-xl font-bold text-red-600">{detail?.summary?.unmatchedCount ?? 0}</p>
              </CardContent></Card>
            </div>
            <Button onClick={handleAutoMatch} disabled={autoMatching} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className={`h-4 w-4 me-2 ${autoMatching ? "animate-spin" : ""}`} />
              {autoMatching ? "جارٍ المطابقة..." : "مطابقة تلقائية"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                بنود غير متطابقة ({unmatchedRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {unmatchedRows.length === 0 ? (
                <div className="p-6 text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-green-600 font-semibold">جميع البنود متطابقة!</p>
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "statementDate", header: "التاريخ", render: (r: any) => <span className="text-xs text-gray-500">{r.statementDate ? formatDateAr(r.statementDate) : "-"}</span> },
                    { key: "description", header: "الوصف", render: (r: any) => <span className="text-sm">{r.description || "-"}</span> },
                    { key: "reference", header: "المرجع", render: (r: any) => <span className="font-mono text-xs text-gray-500">{r.reference || "-"}</span> },
                    { key: "type", header: "النوع", render: (r: any) => (
                      <Badge variant={r.type === "debit" ? "default" : "secondary"}>
                        {r.type === "debit" ? "مدين" : "دائن"}
                      </Badge>
                    ) },
                    { key: "amount", header: "المبلغ", render: (r: any) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
                    { key: "actions", header: "مطابقة يدوية", render: (r: any) => (
                      <Link href={`/finance/bank-reconciliation/manual-match/${activeBatch}/${r.id}`}>
                        <Button variant="ghost" size="sm">
                          <Link2 className="h-4 w-4 text-blue-500" />
                        </Button>
                      </Link>
                    ) },
                  ] as DataTableColumn<any>[]}
                  data={unmatchedRows}
                  rowClassName={() => "bg-red-50/30"}
                  searchPlaceholder={null}
                  emptyMessage="لا توجد بنود غير متطابقة"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                بنود متطابقة ({matchedRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  { key: "statementDate", header: "التاريخ", render: (r: any) => <span className="text-xs text-gray-500">{r.statementDate ? formatDateAr(r.statementDate) : "-"}</span> },
                  { key: "description", header: "وصف الكشف", render: (r: any) => <span className="text-sm">{r.description || "-"}</span> },
                  { key: "amount", header: "المبلغ", render: (r: any) => <span className="font-semibold text-green-600">{formatCurrency(Number(r.amount))}</span> },
                  { key: "jeRef", header: "قيد يومية", render: (r: any) => <span className="font-mono text-xs text-blue-600">{r.jeRef || "-"}</span> },
                  { key: "jeDate", header: "تاريخ القيد", render: (r: any) => <span className="text-xs text-gray-500">{r.jeDate ? formatDateAr(r.jeDate) : "-"}</span> },
                ] as DataTableColumn<any>[]}
                data={matchedRows}
                rowClassName={() => "bg-green-50/20"}
                searchPlaceholder={null}
                emptyMessage="لا توجد بنود متطابقة بعد"
              />
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
