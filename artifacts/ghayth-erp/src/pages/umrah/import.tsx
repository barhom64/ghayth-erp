import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Upload } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const EXPECTED_FIELDS = ["fullName", "passportNumber", "nationality", "arrivalDate", "departureDate"];
const FIELD_LABELS: Record<string, string> = {
  fullName: "الاسم الكامل", passportNumber: "رقم الجواز", nationality: "الجنسية",
  arrivalDate: "تاريخ الوصول", departureDate: "تاريخ المغادرة", phone: "الهاتف",
  gender: "الجنس", birthDate: "تاريخ الميلاد", agentId: "الوكيل",
};

export default function UmrahImport() {
  const { data: seasons, isLoading, isError } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const { data: logs, refetch: refetchLogs } = useApiQuery<any>(["umrah-import-logs"], "/umrah/import-logs");
  const [seasonId, setSeasonId] = useState("");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [dropFiles, setDropFiles] = useState<Attachment[]>([]);
  const { toast } = useToast();

  const clearFile = () => {
    setParsedRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
    setDropFiles([]);
  };

  const handleDropFiles = async (files: Attachment[]) => {
    setDropFiles(files);
    if (files.length === 0) { clearFile(); return; }
    const latest = files[files.length - 1];
    const validExts = [".xlsx", ".xls", ".csv"];
    const ext = latest.name.substring(latest.name.lastIndexOf(".")).toLowerCase();
    if (!validExts.includes(ext)) {
      setParseError("يُرجى رفع ملف إكسل أو ملف جدولي");
      setParsedRows([]);
      setFileName("");
      setResult(null);
      return;
    }
    parseExcelFromDataUrl(latest.dataUrl, latest.name);
  };

  const parseExcelFromDataUrl = async (dataUrl: string, name: string) => {
    setParseError("");
    setParsedRows([]);
    setResult(null);
    setFileName(name);
    try {
      const { parseXlsxToObjects } = await import("@/lib/excel-import");
      const base64 = dataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const data = await parseXlsxToObjects(bytes);
      if (data.length === 0) { setParseError("الملف فارغ أو لا يحتوي على بيانات"); return; }
      const rows = data.map((row) => {
        const keys = Object.keys(row);
        const mapped: any = {};
        const fieldMap: Record<string, string> = {
          "الاسم الكامل": "fullName", "الاسم": "fullName", "name": "fullName", "fullname": "fullName", "full_name": "fullName",
          "رقم الجواز": "passportNumber", "الجواز": "passportNumber", "passport": "passportNumber", "passport_number": "passportNumber", "passportnumber": "passportNumber",
          "الجنسية": "nationality", "nationality": "nationality",
          "تاريخ الوصول": "arrivalDate", "الوصول": "arrivalDate", "arrival": "arrivalDate", "arrival_date": "arrivalDate", "arrivaldate": "arrivalDate",
          "تاريخ المغادرة": "departureDate", "المغادرة": "departureDate", "departure": "departureDate", "departure_date": "departureDate", "departuredate": "departureDate",
          "الهاتف": "phone", "phone": "phone", "الجنس": "gender", "gender": "gender",
          "تاريخ الميلاد": "birthDate", "birthdate": "birthDate", "birth_date": "birthDate",
        };
        keys.forEach(k => {
          const normalizedKey = k.trim().toLowerCase();
          const mappedKey = fieldMap[normalizedKey] || fieldMap[k.trim()] || k.trim();
          let val = row[k];
          if (val instanceof Date) val = val.toISOString().split("T")[0];
          mapped[mappedKey] = String(val || "").trim();
        });
        return mapped;
      });
      setParsedRows(rows);
    } catch (e: any) {
      setParseError(`خطأ في قراءة الملف: ${e.message || "خطأ غير معروف"}`);
    }
  };

  const getRowValidation = (row: any) => {
    const missing: string[] = [];
    EXPECTED_FIELDS.forEach(f => { if (!row[f]) missing.push(f); });
    return missing;
  };

  const validRows = parsedRows.filter(r => getRowValidation(r).length === 0);
  const invalidRows = parsedRows.filter(r => getRowValidation(r).length > 0);

  const doImport = async () => {
    if (!seasonId || validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch<any>("/umrah/import", {
        method: "POST",
        body: JSON.stringify({ seasonId: Number(seasonId), rows: validRows, fileType: "excel", fileName }),
      });
      setResult(res);
      toast({ title: `تم الاستيراد: ${res.new} جديد، ${res.updated} محدث` });
      refetchLogs();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.error || "خطأ في الاستيراد" });
    } finally {
      setImporting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">استيراد المعتمرين</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">رفع ملف إكسل</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>الموسم *</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {(seasons?.data || []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <FileDropZone files={dropFiles} onFilesChange={handleDropFiles} label="ملف إكسل أو ملف جدولي" maxSizeMB={10} />

          {fileName && parsedRows.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-status-info-surface border border-status-info-surface">
              <Upload className="h-5 w-5 text-status-info-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-status-info-foreground truncate">{fileName}</p>
                <p className="text-xs text-status-info-foreground">{parsedRows.length} صف — {validRows.length} صالح، {invalidRows.length} يحتاج مراجعة</p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFile} className="text-status-info-foreground hover:text-status-info-foreground shrink-0">تغيير الملف</Button>
            </div>
          )}

          {parseError && (
            <div className="p-3 rounded-lg bg-status-error-surface border border-status-error-surface text-sm text-status-error-foreground">{parseError}</div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">معاينة البيانات ({parsedRows.length} صف)</Label>
                {invalidRows.length > 0 && (
                  <Badge className="bg-status-warning-surface text-status-warning-foreground">{invalidRows.length} صف يحتاج مراجعة</Badge>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <DataTable
                  columns={[
                    {
                      key: "__index",
                      header: "#",
                      width: "40px",
                      className: "text-xs text-muted-foreground",
                      render: (_row, i) => i + 1,
                    },
                    ...Object.keys(parsedRows[0] || {}).slice(0, 6).map((k) => ({
                      key: k,
                      header: FIELD_LABELS[k] || k,
                      className: "text-xs",
                      render: (row: any) => {
                        const missing = getRowValidation(row);
                        return (
                          <span className={missing.includes(k) ? "text-status-error-foreground font-medium" : ""}>
                            {row[k] || <span className="text-red-400">—</span>}
                          </span>
                        );
                      },
                    })),
                    {
                      key: "__status",
                      header: "الحالة",
                      className: "text-xs",
                      render: (row) => {
                        const missing = getRowValidation(row);
                        return missing.length === 0 ? (
                          <Badge className="bg-status-success-surface text-status-success-foreground text-[10px]">صالح</Badge>
                        ) : (
                          <Badge className="bg-status-warning-surface text-status-warning-foreground text-[10px]">ناقص: {missing.map((m) => FIELD_LABELS[m] || m).join(", ")}</Badge>
                        );
                      },
                    },
                  ] as DataTableColumn<any>[]}
                  data={parsedRows.slice(0, 20)}
                  rowKey={(_row, i) => i}
                  rowClassName={(row) => (getRowValidation(row).length > 0 ? "bg-status-warning-surface/50" : undefined)}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا توجد بيانات"
                />
                {parsedRows.length > 20 && (
                  <p className="text-center text-xs text-muted-foreground py-2">و {parsedRows.length - 20} صفوف أخرى...</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <GuardedButton perm="umrah:create" onClick={doImport} disabled={!seasonId || validRows.length === 0 || importing} className="gap-2">
              {importing ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Upload className="h-4 w-4" />}
              {importing ? "جاري الاستيراد..." : `استيراد ${validRows.length} صف`}
            </GuardedButton>
          </div>

          {result && (
            <div className="p-3 rounded bg-muted text-sm space-y-1">
              <div>إجمالي: {result.total} | جديد: <span className="text-status-success-foreground font-bold">{result.new}</span> | محدث: <span className="text-status-info-foreground font-bold">{result.updated}</span> | مكرر: {result.duplicates} | أخطاء: <span className="text-status-error-foreground">{result.errors}</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">سجل الاستيراد</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "createdAt", header: "التاريخ", render: (l: any) => formatDateAr(l.createdAt) },
              { key: "fileName", header: "الملف" },
              { key: "totalRows", header: "الإجمالي" },
              { key: "newRecords", header: "جديد", render: (l: any) => <span className="text-status-success-foreground">{l.newRecords}</span> },
              { key: "updatedRecords", header: "محدث", render: (l: any) => <span className="text-status-info-foreground">{l.updatedRecords}</span> },
              { key: "errorRecords", header: "أخطاء", render: (l: any) => <span className="text-status-error-foreground">{l.errorRecords}</span> },
            ] as DataTableColumn<any>[]}
            data={logs?.data || []}
            noToolbar
            pageSize={20}
            emptyMessage="لا يوجد سجلات استيراد"
          />
        </CardContent>
      </Card>
    </div>
  );
}
