import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell } from "@/components/page-shell";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/formatters";
import { Upload, CheckCircle2, AlertTriangle, Link2, ArrowRight, FileSpreadsheet, AlertOctagon } from "lucide-react";

type FileType = "mutamers" | "vouchers";

interface PreviewSummary {
  total?: number;
  newCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  errorCount?: number;
  errors?: { row: number; message: string }[];
  unlinkedSubAgents?: { nuskCode: string; name: string; rowCount: number }[];
  /** Primary agents the confirm step will auto-create (no existing match). */
  newAgentsToCreate?: { nuskAgentNumber: string | null; agentName: string; rowCount: number }[];
  /** Rows that name no agent at all (agentId saved as NULL). */
  rowsWithoutAgent?: number;
  violationsDetected?: number;
  rows?: any[];
}

export default function UmrahImportWizard() {
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [fileType, setFileType] = useState<FileType>("mutamers");
  const [seasonId, setSeasonId] = useState("");
  const [dropFiles, setDropFiles] = useState<Attachment[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ batchId?: string | number } | null>(null);
  const [linkingSubAgent, setLinkingSubAgent] = useState<{ nuskCode: string; name: string } | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [linking, setLinking] = useState(false);
  // Voucher-only fields (gaps #2 + #3): pick the cash box that funds
  // NUSK payments + optionally override the umrah-nusk-cost DR account.
  const [treasuryId, setTreasuryId] = useState("");
  const [purchaseAccountCode, setPurchaseAccountCode] = useState("");

  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");
  const clientsQ = useApiQuery<{ data: any[] }>(["clients"], "/clients");
  // Asset accounts that can act as the cash box (treasuries are modelled
  // as chart-of-accounts rows; we filter to postingOnly so abstract
  // header accounts don't pollute the dropdown).
  const treasuriesQ = useApiQuery<{ data: { id: number; code: string; name: string }[] }>(
    ["finance-accounts-assets-posting"],
    "/finance/accounts?type=asset&postingOnly=true",
  );
  const expenseAccountsQ = useApiQuery<{ data: { id: number; code: string; name: string }[] }>(
    ["finance-accounts-expense-posting"],
    "/finance/accounts?type=expense&postingOnly=true",
  );
  const seasons = seasonsQ.data?.data ?? [];
  const clients = clientsQ.data?.data ?? [];
  const treasuryAccounts = treasuriesQ.data?.data ?? [];
  const expenseAccounts = expenseAccountsQ.data?.data ?? [];

  const clearFile = () => {
    setDropFiles([]);
    setFileName("");
    setParsedRows([]);
    setParseError("");
    setPreview(null);
  };

  const handleDropFiles = async (files: Attachment[]) => {
    setDropFiles(files);
    if (files.length === 0) { clearFile(); return; }
    const latest = files[files.length - 1];
    const ext = latest.name.substring(latest.name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".xlsx") {
      setParseError("يُرجى رفع ملف Excel بامتداد .xlsx فقط");
      setParsedRows([]);
      setFileName("");
      return;
    }
    setParseError("");
    setFileName(latest.name);
    try {
      const XLSX: any = await import("xlsx");
      const base64 = latest.dataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const wb = XLSX.read(bytes, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) { setParseError("الملف لا يحتوي على أوراق عمل"); return; }
      const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
      if (data.length === 0) { setParseError("الملف فارغ"); return; }
      const rows = data.map((row: any) => {
        const mapped: any = {};
        Object.keys(row).forEach((k) => {
          let val = row[k];
          if (val instanceof Date) val = val.toISOString().split("T")[0];
          mapped[k.trim()] = String(val ?? "").trim();
        });
        return mapped;
      });
      setParsedRows(rows);
    } catch (e: any) {
      setParseError(`خطأ في قراءة الملف: ${e?.message ?? "خطأ غير معروف"}`);
    }
  };

  const runPreview = async () => {
    if (!seasonId || parsedRows.length === 0) return;
    setPreviewing(true);
    try {
      const res: any = await apiFetch("/umrah/import/preview", {
        method: "POST",
        body: JSON.stringify({
          fileType,
          seasonId: Number(seasonId),
          fileName,
          rows: parsedRows,
        }),
      });
      const summary: PreviewSummary = res?.data ?? res;
      setPreview(summary);
      setStep(2);
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "تعذّر معاينة الاستيراد" });
    } finally {
      setPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !seasonId) return;
    setConfirming(true);
    try {
      const endpoint = fileType === "mutamers" ? "/umrah/import/mutamers" : "/umrah/import/vouchers";
      const body: Record<string, unknown> = {
        seasonId: Number(seasonId),
        fileName,
        rows: parsedRows,
      };
      // Cash-box + account override (gaps #2 + #3) only apply to vouchers.
      if (fileType === "vouchers") {
        if (treasuryId) body.treasuryId = Number(treasuryId);
        if (purchaseAccountCode) body.purchaseAccountCode = purchaseAccountCode;
      }
      const res: any = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = res?.data ?? res;
      setConfirmResult({ batchId: data?.batchId ?? data?.id });
      toast({ title: "تم تنفيذ الاستيراد بنجاح" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "تعذّر تنفيذ الاستيراد" });
    } finally {
      setConfirming(false);
    }
  };

  const doLinkSubAgent = async () => {
    if (!linkingSubAgent || !linkClientId) return;
    setLinking(true);
    try {
      await apiFetch(`/umrah/sub-agents/link-by-nusk`, {
        method: "POST",
        body: JSON.stringify({
          nuskCode: linkingSubAgent.nuskCode,
          clientId: Number(linkClientId),
        }),
      });
      toast({ title: "تم ربط الوكيل الفرعي بالعميل" });
      setPreview((p) => p
        ? { ...p, unlinkedSubAgents: (p.unlinkedSubAgents ?? []).filter((u) => u.nuskCode !== linkingSubAgent.nuskCode) }
        : p);
      setLinkingSubAgent(null);
      setLinkClientId("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "تعذّر الربط" });
    } finally {
      setLinking(false);
    }
  };

  const canPreview = useMemo(
    () => !!seasonId && parsedRows.length > 0 && !parseError,
    [seasonId, parsedRows, parseError],
  );

  return (
    <PageShell
      title="معالج استيراد العمرة"
      subtitle="استيراد ملفات Excel للمعتمرين أو البوشرات مع معاينة وربط ذكي"
      breadcrumbs={[{ label: "العمرة" }, { label: "الاستيراد" }]}
    >
      <UmrahTabsNav />

      {/* Steps header */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium ${step === 1 ? "bg-status-info-surface text-status-info-foreground" : "bg-muted text-muted-foreground"}`}>
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">1</span>
          رفع الملف
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180" />
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium ${step === 2 ? "bg-status-info-surface text-status-info-foreground" : "bg-muted text-muted-foreground"}`}>
          <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${step === 2 ? "bg-blue-600 text-white" : "bg-muted-foreground/40 text-white"}`}>2</span>
          تأكيد الاستيراد
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الموسم *</Label>
                <Select value={seasonId} onValueChange={setSeasonId}>
                  <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
                  <SelectContent>
                    {seasons.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع الملف *</Label>
                <div className="flex gap-3 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded border flex-1 hover:bg-muted/30">
                    <input
                      type="radio"
                      name="fileType"
                      checked={fileType === "mutamers"}
                      onChange={() => setFileType("mutamers")}
                    />
                    <span className="text-sm">معتمرون</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded border flex-1 hover:bg-muted/30">
                    <input
                      type="radio"
                      name="fileType"
                      checked={fileType === "vouchers"}
                      onChange={() => setFileType("vouchers")}
                    />
                    <span className="text-sm">بوشرات</span>
                  </label>
                </div>
              </div>
            </div>

            {fileType === "vouchers" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-muted/40 bg-muted/10">
                <div>
                  <Label className="text-xs">الخزنة (الصندوق النقدي)</Label>
                  <p className="text-[11px] text-muted-foreground mb-1">حساب الأصول الذي ستُسحب منه دفعات نسك. اختياري — اتركه فارغًا لتأجيل الربط.</p>
                  <Select value={treasuryId} onValueChange={setTreasuryId}>
                    <SelectTrigger><SelectValue placeholder="اختر الخزنة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— بلا ربط الآن —</SelectItem>
                      {treasuryAccounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">حساب المشتريات (تجاوز الافتراضي)</Label>
                  <p className="text-[11px] text-muted-foreground mb-1">رمز حساب المصاريف الذي سيُحمَّل بتكلفة هذه الدُفعة. اختياري — يستخدم الافتراضي (٥٢٠١) إن تُرك فارغًا.</p>
                  <Select value={purchaseAccountCode} onValueChange={setPurchaseAccountCode}>
                    <SelectTrigger><SelectValue placeholder="افتراضي النظام (٥٢٠١)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— استخدم الافتراضي —</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.code}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <FileDropZone
              files={dropFiles}
              onFilesChange={handleDropFiles}
              label="ملف Excel (.xlsx فقط)"
              maxSizeMB={20}
            />

            {fileName && parsedRows.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-status-info-surface border border-status-info-surface">
                <FileSpreadsheet className="h-5 w-5 text-status-info-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-status-info-foreground truncate">{fileName}</p>
                  <p className="text-xs text-status-info-foreground">
                    تم قراءة {formatNumber(parsedRows.length)} صف من الملف
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFile} className="text-status-info-foreground">
                  تغيير الملف
                </Button>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-status-error-surface border border-status-error-surface text-sm text-status-error-foreground">
                <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <GuardedButton
                perm="umrah:write"
                disabled={!canPreview || previewing}
                onClick={runPreview}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {previewing ? "جاري التحليل..." : "معاينة الاستيراد"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && preview && (
        <div className="space-y-4">
          {/* Summary tiles */}
          <div className="grid gap-3 md:grid-cols-5">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-xl font-bold">{formatNumber(preview.total ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">جديد</p>
              <p className="text-xl font-bold text-emerald-700">{formatNumber(preview.newCount ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">محدث</p>
              <p className="text-xl font-bold text-status-info-foreground">{formatNumber(preview.updatedCount ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">بدون تغيير</p>
              <p className="text-xl font-bold text-muted-foreground">{formatNumber(preview.unchangedCount ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">أخطاء</p>
              <p className="text-xl font-bold text-status-error-foreground">{formatNumber(preview.errorCount ?? 0)}</p>
            </CardContent></Card>
          </div>

          {preview.violationsDetected != null && preview.violationsDetected > 0 && (
            <Card className="border-status-warning-surface bg-status-warning-surface">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-status-warning-foreground" />
                <p className="text-sm text-status-warning-foreground">
                  تم رصد <strong>{formatNumber(preview.violationsDetected)}</strong> مخالفة محتملة ستُنشأ تلقائياً.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Unlinked sub-agents */}
          {preview.unlinkedSubAgents && preview.unlinkedSubAgents.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="h-4 w-4 text-status-error-foreground" />
                  <h3 className="font-semibold">وكلاء فرعيون غير مربوطين ({formatNumber(preview.unlinkedSubAgents.length)})</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  الوكلاء الفرعيون التاليون موجودون في الملف ولكن غير مربوطين بعملاء في النظام. يمكنك ربطهم الآن قبل التأكيد.
                </p>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-start font-medium">رمز نُسك</th>
                        <th className="p-2 text-start font-medium">الاسم</th>
                        <th className="p-2 text-start font-medium">عدد الصفوف</th>
                        <th className="p-2 text-start font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.unlinkedSubAgents.map((u) => (
                        <tr key={u.nuskCode} className="border-t">
                          <td className="p-2 font-mono text-xs" dir="ltr">{u.nuskCode}</td>
                          <td className="p-2">{u.name}</td>
                          <td className="p-2">{formatNumber(u.rowCount)}</td>
                          <td className="p-2">
                            <GuardedButton
                              perm="umrah:write"
                              size="sm"
                              variant="outline"
                              onClick={() => setLinkingSubAgent(u)}
                              className="gap-1"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              ربط الآن
                            </GuardedButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* New agents to auto-create */}
          {preview.newAgentsToCreate && preview.newAgentsToCreate.length > 0 && (
            <Card className="border-status-warning-surface">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
                  <h3 className="font-semibold text-status-warning-foreground">وكلاء سيتم إنشاؤهم تلقائياً ({formatNumber(preview.newAgentsToCreate.length)})</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  الوكلاء التاليون مذكورون في الملف ولا يوجد لهم سجل في النظام. سيُنشأون تلقائياً عند التأكيد. راجع الأسماء قبل المتابعة لتجنّب إنشاء سجلات مكررة بفروق إملائية.
                </p>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-start font-medium">رقم الوكيل</th>
                        <th className="p-2 text-start font-medium">الاسم</th>
                        <th className="p-2 text-start font-medium">عدد الصفوف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.newAgentsToCreate.map((a, idx) => (
                        <tr key={`${a.nuskAgentNumber ?? "name"}-${idx}`} className="border-t">
                          <td className="p-2 font-mono text-xs" dir="ltr">{a.nuskAgentNumber ?? "—"}</td>
                          <td className="p-2">{a.agentName}</td>
                          <td className="p-2">{formatNumber(a.rowCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rows with no agent — silent data loss prevention */}
          {preview.rowsWithoutAgent && preview.rowsWithoutAgent > 0 && (
            <Card className="border-status-warning-surface">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
                  <p className="text-sm text-status-warning-foreground">
                    <strong>{formatNumber(preview.rowsWithoutAgent)}</strong> صفًا لا يحوي رقم وكيل ولا اسم وكيل — ستُحفظ بدون ربط بأي وكيل (لن تظهر في كشوف الوكلاء).
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {preview.errors && preview.errors.length > 0 && (
            <Card className="border-status-error-surface">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2 text-status-error-foreground">أخطاء في الصفوف</h3>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {preview.errors.slice(0, 20).map((e, i) => (
                    <li key={i} className="flex gap-2 p-1.5 bg-status-error-surface rounded">
                      <Badge variant="outline" className="bg-status-error-surface text-status-error-foreground border-status-error-surface">
                        صف {formatNumber(e.row)}
                      </Badge>
                      <span>{e.message}</span>
                    </li>
                  ))}
                  {preview.errors.length > 20 && (
                    <li className="text-xs text-muted-foreground text-center py-1">
                      و {formatNumber(preview.errors.length - 20)} خطأ آخر...
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {!confirmResult && (
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                العودة للرفع
              </Button>
              <GuardedButton
                perm="umrah:write"
                disabled={confirming || ((preview.errorCount ?? 0) > 0 && !preview.newCount && !preview.updatedCount)}
                onClick={confirmImport}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {confirming ? "جاري التنفيذ..." : "تأكيد الاستيراد"}
              </GuardedButton>
            </div>
          )}

          {/* Success block */}
          {confirmResult && (
            <Card className="border-emerald-300 bg-emerald-50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <h3 className="font-bold text-emerald-800">تم تنفيذ الاستيراد بنجاح</h3>
                </div>
                {confirmResult.batchId && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">معرف الدفعة:</span>
                    <Badge variant="outline" className="font-mono">{String(confirmResult.batchId)}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/import-batches/${confirmResult.batchId}`}>
                        عرض تفاصيل الدفعة
                      </Link>
                    </Button>
                  </div>
                )}
                <div>
                  <Button variant="outline" onClick={() => {
                    setStep(1);
                    setPreview(null);
                    setConfirmResult(null);
                    clearFile();
                  }}>
                    استيراد ملف آخر
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Link sub-agent dialog */}
      <Dialog open={!!linkingSubAgent} onOpenChange={(o) => { if (!o) { setLinkingSubAgent(null); setLinkClientId(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ربط الوكيل الفرعي بعميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {linkingSubAgent && (
              <div className="p-3 rounded bg-muted/30 text-sm">
                <p><span className="text-muted-foreground">رمز نُسك:</span> <strong dir="ltr" className="font-mono">{linkingSubAgent.nuskCode}</strong></p>
                <p><span className="text-muted-foreground">الاسم:</span> <strong>{linkingSubAgent.name}</strong></p>
              </div>
            )}
            <div>
              <Label className="text-xs">اختر العميل</Label>
              <SearchableSelect
                options={clients.map((c: any) => ({
                  value: String(c.id),
                  label: c.name ?? c.companyName ?? `#${c.id}`,
                  sublabel: c.phone,
                }))}
                value={linkClientId}
                onValueChange={setLinkClientId}
                placeholder="اختر عميلاً..."
                searchPlaceholder="ابحث في العملاء..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkingSubAgent(null); setLinkClientId(""); }}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              disabled={!linkClientId || linking}
              onClick={doLinkSubAgent}
            >
              {linking ? "جاري الربط..." : "ربط"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
