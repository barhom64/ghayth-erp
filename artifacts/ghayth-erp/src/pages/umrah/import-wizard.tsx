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
import { PageShell } from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, todayLocal } from "@/lib/formatters";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Upload, CheckCircle2, AlertTriangle, Link2, ArrowRight, FileSpreadsheet, AlertOctagon, Trash2 } from "lucide-react";

type FileType = "mutamers" | "vouchers";

interface PreviewSummary {
  total?: number;
  newCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  errorCount?: number;
  errors?: {
    row: number;
    message: string;
    /** Engine field that triggered the rejection (nullable for legacy responses). */
    fieldName?: string | null;
    /** Small subset of the row values so the operator can identify it in Excel. */
    sample?: Record<string, unknown> | null;
  }[];
  unlinkedSubAgents?: { nuskCode: string; name: string; rowCount: number }[];
  /** Primary agents the confirm step will auto-create (no existing match). */
  newAgentsToCreate?: { nuskAgentNumber: string | null; agentName: string; rowCount: number }[];
  /** Rows that name no agent at all (agentId saved as NULL). */
  rowsWithoutAgent?: number;
  /** Rows that name no group (groupId saved as NULL). Recoverable via /umrah/import/:id/unlinked. */
  rowsWithoutGroup?: number;
  /** Rows that name no sub-agent (subAgentId saved as NULL). Same recovery path. */
  rowsWithoutSubAgent?: number;
  violationsDetected?: number;
  rows?: any[];
  /**
   * U-11 Phase 3a — current `umrah.auto_link.clientLinkagePolicy`.
   * Surfaced verbatim so the banner can name the company's declared
   * stance. The preview engine never acts on this; Phase 3a is
   * detection-only.
   */
  clientLinkagePolicy?: string;
  /**
   * Non-null when the import would touch sub-agents lacking a
   * `clientId`. The same signal `generateSalesInvoice` would raise
   * later — surfaced up-front so the operator can link before
   * confirm rather than after a failed invoice draft.
   */
  unlinkedSubAgentInvoicingHint?: {
    willBlockInvoicing: boolean;
    unlinkedSubAgentCount: number;
    activePolicy: string;
    arabicHint: string;
  } | null;
}

// Arabic labels for the `umrah_import_changes` audit trail. Engine writes
// raw `entityType` / `changeType` strings ("mutamer", "created") to the
// table — the wizard's "تفاصيل التعديلات" view translates them so the
// operator reads "معتمر / أُنشئ" instead of the raw identifiers.
const IMPORT_CHANGE_ENTITY_LABELS_AR: Record<string, string> = {
  mutamer: "معتمر",
  nusk_invoice: "فاتورة نُسك",
};

const IMPORT_CHANGE_TYPE_LABELS_AR: Record<string, string> = {
  created: "أُنشئ",
  updated: "حُدّث",
  skipped: "تُجوهل",
  error: "خطأ",
};

function formatSamplePreview(
  sample: Record<string, unknown>,
  labels: Record<string, string> = {},
): string {
  const entries = Object.entries(sample).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return "—";
  // Translate the sample's field keys to Arabic so the rejected-row
  // diagnostics read "رقم الجواز: ..." not "passportNumber: ...".
  // Falls back to the raw key only when a label is missing.
  return entries.map(([k, v]) => `${labels[k] ?? k}: ${String(v)}`).join(" · ");
}

/**
 * Routed through the unified print engine (csvAdapter) so the export
 * shows up in `/reports/print-log` alongside every other CSV produced
 * by the platform. The column list is dynamic — sample keys are the
 * union across all error rows — but the engine expects a fixed
 * `columns` projection, which we materialize per-call below.
 */
async function downloadRejectedRowsCsv(
  errors: NonNullable<PreviewSummary["errors"]>,
  fileType: FileType,
  labels: Record<string, string>,
): Promise<void> {
  const sampleKeys = Array.from(
    new Set(errors.flatMap((e) => (e.sample ? Object.keys(e.sample) : []))),
  );
  const rows = errors.map((e) => {
    const flat: Record<string, unknown> = {
      // formatNumber emits Arabic-Indic digits when the global format
      // setting is "ar", so the CSV's row numbers match the wizard's
      // on-screen labels and the rest of the Arabic-first export pipeline.
      row: formatNumber(e.row),
      field: e.fieldName ? (labels[e.fieldName] ?? e.fieldName) : "",
      reason: e.message,
    };
    for (const k of sampleKeys) {
      flat[`sample_${k}`] = e.sample?.[k] ?? "";
    }
    return flat;
  });
  const columns = [
    { key: "row", label: "الصف" },
    { key: "field", label: "الحقل" },
    { key: "reason", label: "سبب الرفض" },
    ...sampleKeys.map((k) => ({ key: `sample_${k}`, label: labels[k] ?? k })),
  ];
  await exportRowsToCsv({
    entityType: `report_umrah_rejected_${fileType}`,
    title: `umrah-rejected-${fileType}-${todayLocal()}`,
    rows,
    columns,
  });
}

export default function UmrahImportWizard() {
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [fileType, setFileType] = useState<FileType>("mutamers");
  const [seasonId, setSeasonId] = useState("");
  const [dropFiles, setDropFiles] = useState<Attachment[]>([]);
  const [fileName, setFileName] = useState("");
  // Detected Excel headers + the operator's mapping decisions. Pre-filled
  // from /umrah/import/header-maps so the wizard recognises NUSK / MOFA
  // layouts immediately; the operator only touches headers the system
  // doesn't already know.
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  // Smart-mapping suggestions per header (PR #1474). Keyed by header text.
  // Populated AFTER the priority cascade fills the obvious matches —
  // suggestions only apply to columns the cascade left unmapped, so a
  // saved preset can't be overridden by a lower-confidence guess.
  interface MappingSuggestion {
    target: string;
    confidence: number;
    matchedKey: string;
    source: "exact" | "fuzzy";
  }
  const [mappingSuggestions, setMappingSuggestions] = useState<Record<string, MappingSuggestion>>({});
  const [showMapping, setShowMapping] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{
    batchId?: string | number;
    newCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    errorCount?: number;
  } | null>(null);
  const [linkingSubAgent, setLinkingSubAgent] = useState<{ nuskCode: string; name: string } | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [linking, setLinking] = useState(false);
  // Voucher-only fields (gaps #2 + #3): pick the cash box that funds
  // NUSK payments + optionally override the umrah-nusk-cost DR account.
  const [treasuryId, setTreasuryId] = useState("");
  const [purchaseAccountCode, setPurchaseAccountCode] = useState("");

  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");
  const clientsQ = useApiQuery<{ data: any[] }>(["clients"], "/clients");
  // Built-in Arabic header dictionaries — the wizard pre-fills the
  // operator's choices from these so the column-mapping step is empty
  // typing only for unknown layouts.
  const headerMapsQ = useApiQuery<{
    mutamers: {
      forward: Record<string, string>;
      targets: Record<string, string[]>;
      labels?: Record<string, string>;
      // groups + groupLabels added by §2 of #1870 — see /umrah/import/header-maps.
      groups?: Record<string, string>;
      groupLabels?: Record<string, string>;
    };
    vouchers: {
      forward: Record<string, string>;
      targets: Record<string, string[]>;
      labels?: Record<string, string>;
      groups?: Record<string, string>;
      groupLabels?: Record<string, string>;
    };
  }>(["umrah-import-header-maps"], "/umrah/import/header-maps");
  // Saved column-mapping presets for THIS operator + fileType. The
  // dropdown lists them so a one-click pick replaces re-mapping every
  // import. Refetches when fileType flips (vouchers ↔ mutamers).
  const presetsQ = useApiQuery<{ data: Array<{ id: number; name: string; fileType: string; mapping: Record<string, string>; isDefault: boolean }> }>(
    ["umrah-import-presets", fileType],
    `/umrah/import/presets?fileType=${fileType}`,
  );
  const presets = presetsQ.data?.data ?? [];
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [savingPreset, setSavingPreset] = useState<boolean>(false);
  const [presetName, setPresetName] = useState<string>("");
  const [makeDefault, setMakeDefault] = useState<boolean>(false);
  // GET /umrah/import/batches — history of prior imports so the user
  // can see what's already been ingested before adding a new batch.
  const batchesQ = useApiQuery<{ data: any[] }>(
    ["umrah-import-batches"],
    "/umrah/import/batches",
  );
  const importBatches: any[] = batchesQ.data?.data ?? [];
  // GET /umrah/import/batches/:id/changes — diff of what changed in a
  // specific batch. Fetched lazily when the user clicks a batch row.
  const [batchChangesId, setBatchChangesId] = useState<number | null>(null);
  const changesQ = useApiQuery<any>(
    ["umrah-import-batch-changes", String(batchChangesId ?? 0)],
    batchChangesId ? `/umrah/import/batches/${batchChangesId}/changes` : null,
    { enabled: batchChangesId !== null },
  );
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
      const { parseXlsxToObjects } = await import("@/lib/excel-import");
      const base64 = latest.dataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const data = await parseXlsxToObjects(bytes);
      if (data.length === 0) { setParseError("الملف فارغ"); return; }
      const rows = data.map((row) => {
        const mapped: Record<string, string> = {};
        Object.keys(row).forEach((k) => {
          let val: unknown = row[k];
          if (val instanceof Date) val = val.toISOString().split("T")[0];
          mapped[k.trim()] = String(val ?? "").trim();
        });
        return mapped;
      });
      setParsedRows(rows);

      // Detect headers + pre-fill the column mapping. Priority order:
      //   1. Saved default preset for this user + fileType (highest)
      //   2. Built-in Arabic dictionary fallback
      //   3. Smart-mapping suggestion (PR #1474) — Arabic-aware fuzzy
      //      match for vendor files with typos / variants the built-in
      //      dict doesn't carry. Only applies to columns the 2 layers
      //      above left blank, so it can't override a saved preset.
      //   4. Empty (operator must map)
      // The mapping panel auto-opens only if at least one column ends
      // up unmapped after all passes — zero typing when the cascade
      // covers everything.
      const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
      setDetectedHeaders(headers);
      const forward = headerMapsQ.data?.[fileType]?.forward ?? {};
      const defaultPreset = presets.find((p) => p.isDefault);
      const auto: Record<string, string> = {};
      const unmappedAfterCascade: string[] = [];
      for (const h of headers) {
        const fromPreset = defaultPreset?.mapping?.[h];
        const target = fromPreset || forward[h];
        if (target) auto[h] = target;
        else { auto[h] = ""; unmappedAfterCascade.push(h); }
      }
      setColumnMapping(auto);
      if (defaultPreset) setSelectedPresetId(String(defaultPreset.id));

      // Smart-mapping pass — POST every unmapped header to the
      // suggest-mapping endpoint and merge high-confidence hits into
      // the mapping. Stays async so the UI doesn't block on file pick
      // (the operator can already see the panel + override anything).
      let finalUnmapped = unmappedAfterCascade.length;
      if (unmappedAfterCascade.length > 0) {
        try {
          const resp: any = await apiFetch("/umrah/import/suggest-mapping", {
            method: "POST",
            body: JSON.stringify({ headers: unmappedAfterCascade, fileType }),
          });
          const suggestions = (resp?.suggestions ?? {}) as Record<string, MappingSuggestion>;
          setMappingSuggestions(suggestions);
          // Apply any suggestion the engine considered high-confidence
          // (the engine already suppressed below 0.6, so anything that
          // came back is safe to pre-fill). Operators can still override
          // via the dropdown — pre-fill just saves clicks on the obvious
          // cases.
          setColumnMapping((current) => {
            const next = { ...current };
            for (const h of unmappedAfterCascade) {
              const s = suggestions[h];
              if (s && !next[h]) {
                next[h] = s.target;
                finalUnmapped--;
              }
            }
            return next;
          });
        } catch {
          // Suggestion lookup is a best-effort enhancement — if it
          // fails (network blip, server down), the operator still has
          // the manual mapping dropdowns. No need to surface an error.
        }
      } else {
        setMappingSuggestions({});
      }
      // If anything is still unmapped after smart-mapping, open the
      // panel so the operator doesn't import garbage by accident.
      setShowMapping(finalUnmapped > 0);
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
          // Operator's column-mapping decisions ride along so the server
          // translates Excel headers the same way the wizard renders them.
          columnMapping,
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
      // Explicit static URLs (rather than a `${kind}-prefixed` template)
      // so the wiring scanner can credit both endpoints. Same payload
      // shape for either branch; the vouchers endpoint accepts the
      // extra treasury + purchase-account overrides.
      const body: Record<string, unknown> = {
        seasonId: Number(seasonId),
        fileName,
        rows: parsedRows,
      };
      if (fileType === "vouchers") {
        if (treasuryId) body.treasuryId = Number(treasuryId);
        if (purchaseAccountCode) body.purchaseAccountCode = purchaseAccountCode;
      }
      // Server applies columnMapping to normalize Arabic headers → DB
      // fields. Sent unconditionally — preview already used the same
      // mapping, so confirm must agree or the row counts diverge.
      body.columnMapping = columnMapping;
      const res: any = fileType === "mutamers"
        ? await apiFetch("/umrah/import/mutamers", { method: "POST", body: JSON.stringify(body) })
        : await apiFetch("/umrah/import/vouchers", { method: "POST", body: JSON.stringify(body) });
      const data = res?.data ?? res;
      const newCount = Number(data?.newCount ?? 0);
      const updatedCount = Number(data?.updatedCount ?? 0);
      const skippedCount = Number(data?.skippedCount ?? 0);
      const errorCount = Number(data?.errorCount ?? 0);
      setConfirmResult({
        batchId: data?.batchId ?? data?.id,
        newCount,
        updatedCount,
        skippedCount,
        errorCount,
      });
      const imported = newCount + updatedCount;
      if (imported === 0) {
        toast({
          variant: "destructive",
          title: "لم يُستورد أي سجل",
          description: `تم تخطّي ${formatNumber(skippedCount)} وتعذّر ${formatNumber(errorCount)}. تأكّد من اختيار نوع الملف الصحيح (معتمرون أو بوشرات) ومن مطابقة الأعمدة.`,
        });
      } else {
        toast({
          title: "تم تنفيذ الاستيراد",
          description: `جديد: ${formatNumber(newCount)} · محدّث: ${formatNumber(updatedCount)}${skippedCount ? ` · متخطّى: ${formatNumber(skippedCount)}` : ""}${errorCount ? ` · أخطاء: ${formatNumber(errorCount)}` : ""}`,
        });
      }
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
                  <Select value={treasuryId || "_none"} onValueChange={(v) => setTreasuryId(v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="اختر الخزنة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— بلا ربط الآن —</SelectItem>
                      {treasuryAccounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">حساب المشتريات (تجاوز الافتراضي)</Label>
                  <p className="text-[11px] text-muted-foreground mb-1">رمز حساب المصاريف الذي سيُحمَّل بتكلفة هذه الدُفعة. اختياري — يستخدم الافتراضي (٥٢٠١) إن تُرك فارغًا.</p>
                  <Select value={purchaseAccountCode || "_none"} onValueChange={(v) => setPurchaseAccountCode(v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="افتراضي النظام (٥٢٠١)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— استخدم الافتراضي —</SelectItem>
                      {expenseAccounts.filter((a) => a.code).map((a) => (
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
                    تم قراءة {formatNumber(parsedRows.length)} صف من الملف · {detectedHeaders.length} عمود
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowMapping((v) => !v)} className="text-status-info-foreground">
                  {showMapping ? "إخفاء الأعمدة" : "ربط الأعمدة"}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearFile} className="text-status-info-foreground">
                  تغيير الملف
                </Button>
              </div>
            )}

            {/* Column-mapping panel — operator review/override. Opens
                automatically when at least one header isn't recognised. */}
            {fileName && parsedRows.length > 0 && showMapping && (
              <div className="rounded-lg border border-muted/40 p-3 bg-muted/10 space-y-2">
                {/* Saved presets row — one click replaces re-mapping. */}
                <div className="flex items-center gap-2 pb-2 border-b border-muted/40">
                  <Label className="text-xs whitespace-nowrap">قالب محفوظ:</Label>
                  <Select
                    value={selectedPresetId || "_none"}
                    onValueChange={(v) => {
                      const id = v === "_none" ? "" : v;
                      setSelectedPresetId(id);
                      if (!id) return;
                      const p = presets.find((x) => String(x.id) === id);
                      if (!p) return;
                      // Re-seed mapping from preset values, falling back
                      // to built-in for headers the preset doesn't cover.
                      const forward = headerMapsQ.data?.[fileType]?.forward ?? {};
                      const next: Record<string, string> = {};
                      for (const h of detectedHeaders) {
                        next[h] = p.mapping[h] ?? forward[h] ?? "";
                      }
                      setColumnMapping(next);
                    }}
                  >
                    <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="— بدون قالب —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— بدون قالب —</SelectItem>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}{p.isDefault ? " ⭐" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSavingPreset(true)}
                    rateLimitAware
                  >
                    حفظ كقالب
                  </Button>
                  {/* Delete the selected preset — wires DELETE
                      /umrah/import/presets/:id (save+list were already
                      wired; this completes the management surface). */}
                  {selectedPresetId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-status-error-foreground"
                      onClick={async () => {
                        const p = presets.find((x) => String(x.id) === selectedPresetId);
                        if (!p) return;
                        try {
                          await apiFetch(`/umrah/import/presets/${p.id}`, { method: "DELETE" });
                          toast({ title: "تم حذف القالب" });
                          setSelectedPresetId("");
                          presetsQ.refetch?.();
                        } catch (err: any) {
                          toast({ variant: "destructive", title: err?.message ?? "فشل الحذف" });
                        }
                      }}
                      rateLimitAware
                      aria-label="حذف القالب"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Inline save form — appears when the operator clicks حفظ. */}
                {savingPreset && (
                  <div className="flex items-end gap-2 p-2 bg-status-info-surface/40 rounded">
                    <div className="flex-1">
                      <Label className="text-xs">اسم القالب</Label>
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="مثال: نسك_فواتير_شهري"
                        className="h-8"
                      />
                    </div>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap pb-1.5">
                      <input
                        type="checkbox"
                        checked={makeDefault}
                        onChange={(e) => setMakeDefault(e.target.checked)}
                      />
                      افتراضي
                    </label>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!presetName.trim()) {
                          toast({ variant: "destructive", title: "اسم القالب مطلوب" });
                          return;
                        }
                        try {
                          await apiFetch("/umrah/import/presets", {
                            method: "POST",
                            body: JSON.stringify({
                              name: presetName.trim(),
                              fileType,
                              mapping: columnMapping,
                              isDefault: makeDefault,
                            }),
                          });
                          toast({ title: "تم حفظ القالب" });
                          setSavingPreset(false);
                          setPresetName("");
                          setMakeDefault(false);
                          presetsQ.refetch?.();
                        } catch (err: any) {
                          toast({ variant: "destructive", title: err?.message ?? "فشل الحفظ" });
                        }
                      }}
                      rateLimitAware
                    >
                      حفظ
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSavingPreset(false)}>
                      إلغاء
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">ربط أعمدة الملف بحقول النظام</p>
                    <p className="text-xs text-muted-foreground">العناوين المعروفة مُختارة تلقائياً. اختر يدوياً للأعمدة الجديدة أو اتركها فارغة لتجاهلها.</p>
                  </div>
                  {(() => {
                    const unmapped = detectedHeaders.filter((h) => !columnMapping[h]).length;
                    if (unmapped === 0) return null;
                    return (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-status-warning-surface bg-status-warning-surface text-status-warning-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        {unmapped} عمود غير مربوط
                      </span>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="column-mapping-grid">
                  {detectedHeaders.map((h) => {
                    const targets = headerMapsQ.data?.[fileType]?.targets ?? {};
                    const labels = headerMapsQ.data?.[fileType]?.labels ?? {};
                    // groups + groupLabels added by §2 of #1870. When a
                    // field is missing from the group catalog it falls
                    // back to "أخرى" so the dropdown never silently
                    // hides a real option (e.g. a brand-new field
                    // shipped before this catalog was updated).
                    const groups = headerMapsQ.data?.[fileType]?.groups ?? {};
                    const groupLabels = headerMapsQ.data?.[fileType]?.groupLabels ?? {};
                    // Logical render order top-down. Matches the engine
                    // catalog's intent: operator skims left-to-right
                    // pilgrim → identity → agent → group → travel →
                    // status → finance.
                    const groupOrder = ["pilgrim", "identity", "agent", "group", "travel", "status", "finance"];
                    const dbFields = Object.keys(targets).sort((a, b) => {
                      const gA = groups[a] ?? "other";
                      const gB = groups[b] ?? "other";
                      const iA = groupOrder.indexOf(gA);
                      const iB = groupOrder.indexOf(gB);
                      const oA = iA === -1 ? 999 : iA;
                      const oB = iB === -1 ? 999 : iB;
                      if (oA !== oB) return oA - oB;
                      // Within a group, sort by ARABIC label so the
                      // operator scans alphabetically inside each
                      // heading. Falls back to the raw field name if
                      // a label is missing.
                      return (labels[a] ?? a).localeCompare(labels[b] ?? b, "ar");
                    });
                    const value = columnMapping[h] ?? "";
                    // Smart-mapping suggestion for this header (PR
                    // #1474). Only shown when the value MATCHES the
                    // suggestion — confirms the auto-pick at a glance.
                    const suggestion = mappingSuggestions[h];
                    const showHint =
                      suggestion != null && suggestion.target === value;
                    // Build SearchableSelect options with group headers.
                    // The "ignore" sentinel is its own group at the top
                    // so the operator can pick it without scrolling.
                    const options = [
                      { value: "_none", label: "— تجاهل العمود —", group: "إجراء" },
                      ...dbFields.map((field) => ({
                        value: field,
                        label: labels[field] ?? field,
                        group: groupLabels[groups[field] ?? "other"] ?? "أخرى",
                      })),
                    ];
                    return (
                      <div key={h} className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground truncate w-1/2" title={h}>{h}</span>
                          <div className="flex-1">
                            <SearchableSelect
                              options={options}
                              value={value || "_none"}
                              onValueChange={(v) => setColumnMapping((m) => ({ ...m, [h]: v === "_none" ? "" : v }))}
                              placeholder="— تجاهل —"
                              searchPlaceholder="ابحث في الحقول..."
                              emptyText="لا توجد حقول مطابقة"
                              className="h-8"
                            />
                          </div>
                        </div>
                        {showHint && (
                          <span
                            className={`text-[10px] pr-1 ${
                              suggestion.source === "exact"
                                ? "text-status-success-foreground"
                                : "text-status-info-foreground"
                            }`}
                            data-testid={`mapping-suggestion-${h}`}
                          >
                            {suggestion.source === "exact"
                              ? `✓ تطابق دقيق`
                              : `💡 اقتراح: "${suggestion.matchedKey}" (${Math.round(suggestion.confidence * 100)}%)`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
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

          {/* U-11 Phase 3a — invoicing-block banner. Renders ONLY when
              the backend surfaces a non-null hint, which itself fires
              ONLY when unlinked sub-agents are present. The banner is
              purely informational: it names the active policy and the
              three guarantees Phase 3a ships under (operational ok,
              no auto-link, invoicing blocked until explicit linkage). */}
          {preview.unlinkedSubAgentInvoicingHint && (
            <Card className="border-status-warning-surface bg-status-warning-surface/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-status-warning-foreground shrink-0" />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-status-warning-foreground">
                      الفوترة محظورة حتى الربط الصريح ({formatNumber(preview.unlinkedSubAgentInvoicingHint.unlinkedSubAgentCount)} وكيل فرعي)
                    </h3>
                    <p className="text-xs">
                      السياسة الحالية للربط:{" "}
                      <span className="font-mono" dir="ltr">
                        {preview.unlinkedSubAgentInvoicingHint.activePolicy}
                      </span>
                    </p>
                    <ul className="text-xs space-y-1 list-disc ps-5">
                      <li>التشغيل مسموح — الوكلاء الفرعيون يُنشأون ككيانات عمرة فقط.</li>
                      <li>الفوترة ممنوعة — `generateSalesInvoice` سيرفض حتى الربط الصريح.</li>
                      <li>لا يوجد ربط تلقائي — لا يُنشأ عميل مالي ولا يُربط أحد بصمت.</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      اربط الوكلاء الفرعيين أدناه عبر زر "ربط الآن" قبل التأكيد، أو اربطهم لاحقاً من صفحة الوكلاء الفرعيين.
                    </p>
                  </div>
                </div>
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
            <Card className="border-status-warning-surface" data-testid="banner-rows-without-agent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
                  <p className="text-sm text-status-warning-foreground">
                    <strong>{formatNumber(preview.rowsWithoutAgent)}</strong> صفًا لا يحوي رقم وكيل ولا اسم وكيل — ستُحفظ بدون ربط بأي وكيل (لن تظهر في كشوف الوكلاء). يمكن استرداد الربط لاحقًا من صفحة الصفوف غير المربوطة في الدفعة.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rows with no group — same silent-loss shape */}
          {preview.rowsWithoutGroup && preview.rowsWithoutGroup > 0 && (
            <Card className="border-status-warning-surface" data-testid="banner-rows-without-group">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
                  <p className="text-sm text-status-warning-foreground">
                    <strong>{formatNumber(preview.rowsWithoutGroup)}</strong> صفًا لا يحوي رقم مجموعة — ستُحفظ بدون ربط بأي مجموعة (لن تظهر في تجميعات المجموعات أو ربحيتها). قابلة للاسترداد بعد التأكيد.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rows with no sub-agent */}
          {preview.rowsWithoutSubAgent && preview.rowsWithoutSubAgent > 0 && (
            <Card className="border-status-warning-surface" data-testid="banner-rows-without-subagent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
                  <p className="text-sm text-status-warning-foreground">
                    <strong>{formatNumber(preview.rowsWithoutSubAgent)}</strong> صفًا لا يحوي رمز مكتب (وكيل فرعي) — ستُحفظ بدون ربط بأي مكتب (لن تظهر في كشوف المكاتب). قابلة للاسترداد بعد التأكيد.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {preview.errors && preview.errors.length > 0 && (() => {
            // Arabic field labels for the rejected-row diagnostics — same
            // source the column-mapping dropdown uses, so "passportNumber"
            // shows as "رقم الجواز" in both the field column and the
            // row-values preview.
            const errorLabels = headerMapsQ.data?.[fileType]?.labels ?? {};
            return (
            <Card className="border-status-error-surface">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-status-error-foreground">
                    أخطاء في الصفوف ({formatNumber(preview.errors.length)})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadRejectedRowsCsv(preview.errors ?? [], fileType, errorLabels)}
                    data-testid="download-rejected-rows-csv"
                  >
                    تنزيل الصفوف المرفوضة (CSV)
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-status-error-surface sticky top-0">
                      <tr className="text-right text-status-error-foreground">
                        <th className="p-2 font-semibold">صف</th>
                        <th className="p-2 font-semibold">الحقل</th>
                        <th className="p-2 font-semibold">سبب الرفض</th>
                        <th className="p-2 font-semibold">قيم الصف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 align-top">
                            <Badge variant="outline" className="font-mono">{formatNumber(e.row)}</Badge>
                          </td>
                          <td className="p-2 align-top text-muted-foreground">
                            {e.fieldName ? (errorLabels[e.fieldName] ?? e.fieldName) : "—"}
                          </td>
                          <td className="p-2 align-top">{e.message}</td>
                          <td className="p-2 align-top text-muted-foreground">
                            {e.sample ? formatSamplePreview(e.sample, errorLabels) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            );
          })()}

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
          {confirmResult && (() => {
            const newC = confirmResult.newCount ?? 0;
            const updC = confirmResult.updatedCount ?? 0;
            const skC = confirmResult.skippedCount ?? 0;
            const erC = confirmResult.errorCount ?? 0;
            const nothing = newC + updC === 0;
            return (
            <Card className={nothing ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {nothing
                    ? <AlertTriangle className="h-6 w-6 text-amber-600" />
                    : <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
                  <h3 className={`font-bold ${nothing ? "text-amber-800" : "text-emerald-800"}`}>
                    {nothing ? "لم يُستورد أي سجل" : "تم تنفيذ الاستيراد بنجاح"}
                  </h3>
                </div>
                {nothing && (
                  <p className="text-sm text-amber-700">
                    تأكّد من اختيار نوع الملف الصحيح في الأعلى (معتمرون أو بوشرات) ومن مطابقة الأعمدة، ثم أعد المحاولة.
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-emerald-700">جديد: {formatNumber(newC)}</span>
                  <span className="text-status-info-foreground">محدّث: {formatNumber(updC)}</span>
                  <span className="text-muted-foreground">متخطّى: {formatNumber(skC)}</span>
                  <span className="text-status-error-foreground">أخطاء: {formatNumber(erC)}</span>
                </div>
                {confirmResult.batchId && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">معرف الدفعة:</span>
                    <Badge variant="outline" className="font-mono">{String(confirmResult.batchId)}</Badge>
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
            );
          })()}
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

      {importBatches.length > 0 && (
        <div className="mt-6 border rounded-lg p-4 bg-white">
          <p className="text-sm font-semibold mb-2">دفعات الاستيراد السابقة ({importBatches.length})</p>
          <div className="divide-y text-xs">
            {importBatches.slice(0, 10).map((b: any) => {
              const unlinkedTotal = (b.unlinkedAgentCount ?? 0)
                + (b.unlinkedGroupCount ?? 0)
                + (b.unlinkedSubAgentCount ?? 0);
              return (
                <div key={b.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => setBatchChangesId(b.id === batchChangesId ? null : b.id)}
                    className="w-full flex items-center justify-between text-right hover:bg-surface-subtle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">#{b.id}</span>
                      <span>{b.fileName ?? "—"}</span>
                      <span className="text-muted-foreground">
                        {b.fileType === "mutamers" ? "معتمرين" : b.fileType === "vouchers" ? "سندات" : b.fileType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {b.insertedCount != null && <span>+{b.insertedCount}</span>}
                      {b.updatedCount != null && <span>~{b.updatedCount}</span>}
                      {b.createdAt && <span>{new Date(b.createdAt).toLocaleDateString("ar-SA")}</span>}
                    </div>
                  </button>
                  {/* Recovery drill-down: appears only when at least one
                      dimension has unlinked rows. Pulls the operator to
                      the /umrah/import/:id/unlinked screen to bulk-link
                      without re-importing the file. */}
                  {unlinkedTotal > 0 && (
                    <a
                      href={`/umrah/import/${b.id}/unlinked`}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-status-warning-foreground hover:underline"
                      data-testid={`link-unlinked-${b.id}`}
                    >
                      <span>⚠</span>
                      <span>
                        {unlinkedTotal} صف بحاجة لاسترداد الربط
                        {b.unlinkedAgentCount ? ` (وكيل: ${b.unlinkedAgentCount})` : ""}
                        {b.unlinkedGroupCount ? ` (مجموعة: ${b.unlinkedGroupCount})` : ""}
                        {b.unlinkedSubAgentCount ? ` (مكتب: ${b.unlinkedSubAgentCount})` : ""}
                      </span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {batchChangesId !== null && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold mb-2">تفاصيل التعديلات للدفعة #{batchChangesId}</p>
              {changesQ.isLoading ? (
                <p className="text-xs text-muted-foreground">جاري التحميل...</p>
              ) : changesQ.data ? (
                <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {Array.isArray(changesQ.data?.data) && changesQ.data.data.length > 0 ? (() => {
                    // Field-name labels come from the same source the
                    // column-mapping dropdown + rejected-row CSV use, so
                    // "totalAmount" → "المبلغ الإجمالي" everywhere the
                    // operator sees an engine field name.
                    const fieldLabels: Record<string, string> = {
                      ...(headerMapsQ.data?.mutamers?.labels ?? {}),
                      ...(headerMapsQ.data?.vouchers?.labels ?? {}),
                    };
                    return changesQ.data.data.slice(0, 30).map((c: any, i: number) => {
                      const entity = IMPORT_CHANGE_ENTITY_LABELS_AR[c.entityType] ?? c.entityType ?? "—";
                      const change = IMPORT_CHANGE_TYPE_LABELS_AR[c.changeType] ?? c.changeType ?? "—";
                      const field = c.fieldName ? (fieldLabels[c.fieldName] ?? c.fieldName) : null;
                      return (
                        <div key={c.id ?? i} className="flex items-center justify-between border-b pb-1">
                          <span>{entity} #{formatNumber(c.entityId ?? 0)}{field ? ` — ${field}` : ""}</span>
                          <span className="text-muted-foreground">{change}</span>
                        </div>
                      );
                    });
                  })() : (
                    <p className="text-muted-foreground">لا توجد تعديلات مسجلة</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
