import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { isMoneyAccount } from "@/lib/finance-account-usage";
import { BranchSelect, AccountSelect } from "@/components/shared/entity-selects";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Upload, Download, FileSpreadsheet, AlertTriangle, Info, Wand2, Save, Trash2 } from "lucide-react";

/**
 * بوابة الاستيراد المالي — م٢-أ (Excel/CSV حتمي) + م٢-ب (تعيين يدوي + قوالب محفوظة).
 * docs/25 §٧ م٢ + §١١.٣.
 *
 * المبدأ الحاكم: «المستورد يمرّ على نفس محرّك الاشتقاق». الصفحة لا تشتقّ قيدًا:
 * ترفع الملف → POST .../import/analyze (تحليل + تعيين فقط) → جدول مراجعة + محرّر
 * تعيين (م٢-ب) → ثم **نفس** POST /finance/documents (dryRun للمعاينة، ثم الحفظ)
 * هو من يشتقّ القيد ويكتب الأثر. لا ازدواج منطق.
 */

type ImportedLine = {
  lineNo: number;
  itemName?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRatePercent: number;
  counterAccountCode?: string;
  costCenter?: string;
};
type ImportWarning = { rowIndex: number; message: string; severity: "skip" | "warn" | "info" };
type ImportStats = {
  totalRows: number;
  mappedRows: number;
  skippedRows: number;
  recognizedColumns: string[];
  unrecognizedColumns: string[];
};
type AnalyzeResponse = {
  direction: "receipt" | "payment";
  documentKind: "voucher" | "expense";
  lines: ImportedLine[];
  warnings: ImportWarning[];
  stats: ImportStats;
  documentBody: { direction: string; documentKind: string; lines: unknown[] };
  headers: string[];
  detectedMapping: Record<string, string>;
  appliedMapping: Record<string, string> | null;
};
type ImportField = { key: string; label: string };
type TemplateMeta = {
  key: string;
  title: string;
  direction: "receipt" | "payment";
  documentKind: "voucher" | "expense";
  note: string | null;
  sampleHeaders: string[];
  sampleCsv: string;
};
type Preset = { id: number; name: string; templateKey: string; mapping: Record<string, string>; isDefault: boolean };
type PreviewLeg = { accountCode: string; debit: number; credit: number };

const lineNet = (l: ImportedLine) => roundMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
const lineTotal = (l: ImportedLine) => roundMoney(lineNet(l) * (1 + (Number(l.taxRatePercent) || 0) / 100));

function readFile(file: File, as: "text" | "dataURL"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    if (as === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export default function FinancialImportGateway() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [templateKey, setTemplateKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [preview, setPreview] = useState<PreviewLeg[] | null>(null);

  // المصدر المُخزَّن لإعادة التحليل بتعيين معدّل دون إعادة رفع الملف (م٢-ب).
  const [lastUpload, setLastUpload] = useState<{ source: "csv" | "excel"; content: string } | null>(null);
  // التعيين القابل للتحرير: ترويسة المصدر → حقل ("" = تجاهل).
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDefault, setPresetDefault] = useState(false);

  // سياق الحفظ (يختاره المستخدم بعد التحليل).
  const [date, setDate] = useState(todayLocal());
  const [branchId, setBranchId] = useState("");
  const [cashAccountCode, setCashAccountCode] = useState("");

  const templatesQ = useApiQuery<{ templates: TemplateMeta[]; fields: ImportField[] }>(
    ["finance-import-templates"],
    "/finance/documents/import/templates",
  );
  const templates = templatesQ.data?.templates ?? [];
  const fields = templatesQ.data?.fields ?? [];
  const selectedTemplate = templates.find((t) => t.key === templateKey);

  const presetsQ = useApiQuery<{ data: Preset[] }>(
    ["finance-import-presets", templateKey],
    templateKey ? `/finance/documents/import/presets?templateKey=${encodeURIComponent(templateKey)}` : null,
  );
  const presets = presetsQ.data?.data ?? [];

  const analyzeMut = useApiMutation<AnalyzeResponse, any>("/finance/documents/import/analyze", "POST", []);
  const savePresetMut = useApiMutation<{ ok: true }, any>("/finance/documents/import/presets", "POST", [["finance-import-presets"]], {
    successMessage: "تم حفظ التعيين كقالب",
  });
  const deletePresetMut = useApiMutation<{ ok: true }, { id: number }>(
    (body) => `/finance/documents/import/presets/${body.id}`,
    "DELETE",
    [["finance-import-presets"]],
  );
  const previewMut = useApiMutation<{ lines: PreviewLeg[] }, any>("/finance/documents", "POST", []);
  const saveMut = useApiMutation<{ journalId: number }, any>("/finance/documents", "POST", [["vouchers"], ["journal-manual"]], {
    successMessage: "تم حفظ المستند المُستورَد",
    onSuccess: () => navigate("/finance/vouchers"),
  });

  const isReceipt = analysis?.direction === "receipt";

  function downloadTemplate() {
    if (!selectedTemplate) { toast({ variant: "destructive", title: "اختر قالبًا أولًا" }); return; }
    const blob = new Blob(["﻿" + selectedTemplate.sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `قالب-${selectedTemplate.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runAnalyze(payload: { source: "csv" | "excel"; content: string }, overrideMapping?: Record<string, string>) {
    const body: Record<string, unknown> = { ...payload, templateKey };
    if (overrideMapping && Object.keys(overrideMapping).length > 0) body.mapping = overrideMapping;
    const res = await analyzeMut.mutateAsync(body);
    setAnalysis(res);
    // التعيين الحالي = المُطبَّق إن وُجد، وإلا الكشف التلقائي.
    setMapping(res.appliedMapping ?? res.detectedMapping ?? {});
    return res;
  }

  async function handleFile(file: File) {
    if (!templateKey) { toast({ variant: "destructive", title: "اختر قالب الاستيراد أولًا" }); return; }
    setFileName(file.name);
    setAnalysis(null);
    setPreview(null);
    setShowMapEditor(false);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name) || /sheet|excel/i.test(file.type);
    try {
      let payload: { source: "csv" | "excel"; content: string };
      if (isExcel) {
        const dataUrl = await readFile(file, "dataURL");
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        payload = { source: "excel", content: base64 };
      } else {
        const text = await readFile(file, "text");
        payload = { source: "csv", content: text };
      }
      setLastUpload(payload);
      // طبّق التعيين الافتراضي للقالب (إن وُجد) عند أول تحليل.
      const def = presets.find((p) => p.isDefault);
      const res = await runAnalyze(payload, def?.mapping);
      if (res.lines.length === 0) {
        toast({ variant: "destructive", title: "لم يُستخرج أي بند صالح — راجع تعيين الأعمدة أو نزّل القالب" });
        setShowMapEditor(true);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر تحليل الملف", description: e?.fix ?? e?.message ?? "" });
    }
  }

  async function reanalyzeWithMapping(nextMapping?: Record<string, string>) {
    if (!lastUpload) return;
    try {
      await runAnalyze(lastUpload, nextMapping ?? mapping);
      setPreview(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّرت إعادة التحليل", description: e?.fix ?? e?.message ?? "" });
    }
  }

  function applyPreset(preset: Preset) {
    setMapping(preset.mapping ?? {});
    setShowMapEditor(true);
    reanalyzeWithMapping(preset.mapping ?? {});
  }

  function handleSavePreset() {
    if (!presetName.trim()) { toast({ variant: "destructive", title: "أدخل اسمًا للقالب" }); return; }
    if (!templateKey) return;
    savePresetMut.mutate({ name: presetName.trim(), templateKey, mapping, isDefault: presetDefault });
    setPresetName("");
    setPresetDefault(false);
  }

  function buildDocumentPayload(extra?: Record<string, unknown>) {
    if (!analysis) return null;
    return {
      direction: analysis.direction,
      documentKind: analysis.documentKind,
      cashAccountCode,
      date: date || undefined,
      branchId: branchId ? Number(branchId) : undefined,
      description: `استيراد: ${fileName || "ملف"}`,
      lines: analysis.lines.map((l) => ({
        itemName: l.itemName || undefined,
        description: l.description || undefined,
        quantity: Number(l.quantity) || 0,
        unit: l.unit || undefined,
        unitPrice: Number(l.unitPrice) || 0,
        taxRatePercent: Number(l.taxRatePercent) || 0,
        counterAccountCode: l.counterAccountCode || undefined,
        costCenter: l.costCenter || undefined,
      })),
      ...extra,
    };
  }

  function validate(): string | null {
    if (!analysis || analysis.lines.length === 0) return "حلّل ملفًا يحتوي بنودًا صالحة أولًا";
    if (!cashAccountCode) return isReceipt ? "حدّد وجهة المال (الخزنة / البنك)" : "حدّد مصدر المال (الخزنة / البنك)";
    return null;
  }

  async function handlePreview() {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      const res = await previewMut.mutateAsync(buildDocumentPayload({ dryRun: true }));
      setPreview(res.lines ?? []);
    } catch (e: any) {
      setPreview(null);
      toast({ variant: "destructive", title: "تعذّرت المعاينة", description: e?.fix ?? e?.message ?? "" });
    }
  }

  function handleSave() {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    const payload = buildDocumentPayload();
    if (payload) saveMut.mutate(payload);
  }

  const totalNet = analysis ? roundMoney(analysis.lines.reduce((s, l) => s + lineNet(l), 0)) : 0;
  const grandTotal = analysis ? roundMoney(analysis.lines.reduce((s, l) => s + lineTotal(l), 0)) : 0;

  return (
    <CreatePageLayout
      title="بوابة الاستيراد المالي"
      subtitle="ارفع ملف Excel/CSV — يُحلَّل ويُعيَّن إلى مستند مالي، ثم يمرّ على نفس محرّك القيد للمعاينة والحفظ"
      backPath="/finance/vouchers"
    >
      <div dir="rtl" className="space-y-5">
        {/* الخطوة ١: القالب + التنزيل + الرفع */}
        <div className="border rounded-lg p-4 space-y-4 bg-surface-subtle">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="w-4 h-4" /> ١) اختر القالب وارفع الملف
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="قالب الاستيراد" required>
              <Select value={templateKey} onValueChange={(v) => { setTemplateKey(v); setAnalysis(null); setPreview(null); setShowMapEditor(false); }}>
                <SelectTrigger><SelectValue placeholder="اختر القالب..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (<SelectItem key={t.key} value={t.key}>{t.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <div className="flex items-end">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} disabled={!selectedTemplate}>
                <Download className="w-4 h-4 ml-1" /> تنزيل القالب الجاهز
              </Button>
            </div>
            <div className="flex items-end">
              <label className="inline-flex w-full">
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
                />
                <Button type="button" className="w-full" disabled={!templateKey || analyzeMut.isPending}
                  onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                  <Upload className="w-4 h-4 ml-1" />
                  {analyzeMut.isPending ? "جاري التحليل..." : "رفع وتحليل ملف"}
                </Button>
              </label>
            </div>
          </div>
          {selectedTemplate?.note && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {selectedTemplate.note}
            </p>
          )}
          {fileName && <p className="text-xs text-muted-foreground">الملف: {fileName}</p>}
        </div>

        {/* الخطوة ٢: مراجعة البنود + محرّر التعيين (م٢-ب) */}
        {analysis && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                ٢) مراجعة البنود — {analysis.direction === "receipt" ? "قبض (مال داخل)" : "صرف (مال خارج)"}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground">
                  صفوف: {analysis.stats.totalRows} · بنود صالحة: {analysis.stats.mappedRows}
                  {analysis.stats.skippedRows > 0 && <> · متخطّاة: {analysis.stats.skippedRows}</>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowMapEditor((s) => !s)}>
                  <Wand2 className="w-4 h-4 ml-1" /> {showMapEditor ? "إخفاء التعيين" : "تعيين الأعمدة"}
                </Button>
              </div>
            </div>

            {/* محرّر التعيين + القوالب المحفوظة (م٢-ب) */}
            {showMapEditor && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                {presets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">قوالب محفوظة:</span>
                    {presets.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1">
                        <button type="button" className="hover:underline" onClick={() => applyPreset(p)}>
                          {p.name}{p.isDefault ? " ★" : ""}
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-destructive"
                          onClick={() => deletePresetMut.mutate({ id: p.id })} aria-label="حذف القالب">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {analysis.headers.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-muted-foreground" title={h}>{h}</span>
                      <span className="text-muted-foreground">→</span>
                      <Select value={mapping[h] ?? ""} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__ignore" ? "" : v }))}>
                        <SelectTrigger className="w-40 h-8"><SelectValue placeholder="تجاهل" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore">— تجاهل —</SelectItem>
                          {fields.map((f) => (<SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => reanalyzeWithMapping()} disabled={analyzeMut.isPending}>
                    <Wand2 className="w-4 h-4 ml-1" /> {analyzeMut.isPending ? "جاري التحليل..." : "إعادة التحليل بالتعيين"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Input className="w-44 h-8" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="اسم القالب لحفظه" />
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Checkbox checked={presetDefault} onCheckedChange={(v) => setPresetDefault(v === true)} /> افتراضي
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={handleSavePreset} disabled={savePresetMut.isPending} rateLimitAware>
                      <Save className="w-4 h-4 ml-1" /> حفظ كقالب
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {analysis.warnings.length > 0 && (
              <div className="space-y-1">
                {analysis.warnings.map((w, i) => (
                  <div key={i} className={`text-xs flex items-start gap-1.5 rounded px-2 py-1 ${
                    w.severity === "info" ? "bg-muted/40 text-muted-foreground" : "bg-status-warning-surface text-status-warning-foreground"
                  }`}>
                    {w.severity === "info" ? <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    {w.message}
                  </div>
                ))}
              </div>
            )}

            {analysis.lines.length > 0 && (
              <DataTable<ImportedLine>
                noToolbar
                pageSize={0}
                className="text-xs"
                data={analysis.lines}
                rowKey={(l) => l.lineNo}
                columns={[
                  { key: "lineNo", header: "#", render: (l) => l.lineNo },
                  { key: "itemName", header: "الصنف / الخدمة", render: (l) => l.itemName || "—" },
                  { key: "description", header: "الوصف", render: (l) => l.description || "—" },
                  { key: "quantity", header: "الكمية", align: "end", render: (l) => l.quantity },
                  { key: "unit", header: "الوحدة", render: (l) => l.unit || "—" },
                  { key: "unitPrice", header: "سعر الوحدة", align: "end", render: (l) => formatCurrency(l.unitPrice) },
                  { key: "taxRatePercent", header: "ضريبة %", align: "end", render: (l) => (l.taxRatePercent ? `${l.taxRatePercent}%` : "—") },
                  { key: "total", header: "الإجمالي", align: "end", render: (l) => <span className="font-mono">{formatCurrency(lineTotal(l))}</span> },
                ] satisfies DataTableColumn<ImportedLine>[]}
              />
            )}
            {analysis.lines.length > 0 && (
              <div className="text-sm text-left font-semibold">
                الإجمالي: صافٍ {formatCurrency(totalNet)} · شامل الضريبة <span className="font-mono">{formatCurrency(grandTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* الخطوة ٣: سياق الحفظ + المعاينة + الحفظ (نفس محرّك /finance/documents) */}
        {analysis && analysis.lines.length > 0 && (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="text-sm font-semibold">٣) سياق الحفظ ثم معاينة القيد</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormFieldWrapper label="التاريخ" required>
                <DatePicker value={date} onChange={setDate} />
              </FormFieldWrapper>
              <BranchSelect value={branchId} onChange={(v) => setBranchId(String(v ?? ""))} label="الفرع" allowCreate={false} autoSelectOwnBranch />
              <AccountSelect
                value={cashAccountCode}
                onChange={setCashAccountCode}
                label={isReceipt ? "وجهة المال (الخزنة / البنك)" : "مصدر المال (الخزنة / البنك)"}
                required
                placeholder="اختر الخزنة أو البنك..."
                filter={(a: any) => isMoneyAccount(a)}
              />
            </div>

            {preview && preview.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-xs font-semibold mb-2">معاينة القيد المشتقّ (قبل الحفظ)</p>
                <DataTable<PreviewLeg>
                  noToolbar
                  pageSize={0}
                  className="text-xs font-mono"
                  data={preview}
                  rowKey={(_l, i) => i}
                  columns={[
                    { key: "accountCode", header: "الحساب", render: (l) => l.accountCode },
                    { key: "debit", header: "مدين", align: "end", render: (l) => <span className="text-orange-700">{l.debit ? formatCurrency(l.debit) : ""}</span> },
                    { key: "credit", header: "دائن", align: "end", render: (l) => <span className="text-emerald-700">{l.credit ? formatCurrency(l.credit) : ""}</span> },
                  ] satisfies DataTableColumn<PreviewLeg>[]}
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={() => navigate("/finance/vouchers")}>إلغاء</Button>
              <Button type="button" variant="outline" onClick={handlePreview} disabled={previewMut.isPending} rateLimitAware>
                {previewMut.isPending ? "جاري المعاينة..." : "معاينة القيد"}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saveMut.isPending} rateLimitAware>
                {saveMut.isPending ? "جاري الحفظ..." : "حفظ المستند المُستورَد"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </CreatePageLayout>
  );
}
