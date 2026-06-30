/**
 * Generic data-import admin page — surfaces the 6 endpoints exposed
 * by the import adapter framework:
 *
 *   GET  /import/entities                — supported entities and their adapter metadata
 *   GET  /import/template/:entity        — column template for an entity (Arabic aliases included)
 *   POST /import/preview                 — dry-run a batch; returns inserts/updates/errors
 *   POST /import/confirm                 — apply a previously-previewed batch (idempotent)
 *   GET  /import/batches                 — last 50 import batches (filterable by entity)
 *   GET  /import/batches/:id             — per-batch detail
 *
 * The page is deliberately power-user — operator pastes JSON or CSV
 * rows, picks an entity, previews, and confirms. Designed for one-off
 * migrations / corrections, not bulk-data loads (those use the
 * domain-specific wizards under /umrah/import etc).
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Database, FileText, Eye, CheckCircle, History, Upload } from "lucide-react";

// Minimal RFC-4180-ish CSV parser (no new dependency): handles quoted fields
// with embedded commas / quotes / newlines, CRLF, and a leading BOM. The first
// non-empty row is the header; each subsequent row becomes an object keyed by
// header. Output flows into the SAME preview/confirm pipeline as pasted JSON,
// so the import engine, validation, rollback and audit are unchanged.
function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { if (h) obj[h] = (r[idx] ?? "").trim(); });
      return obj;
    });
}

interface EntityMeta {
  entity: string;
  table: string;
  uniqueField: string | null;
  requiredFields: string[];
  hasCompanyId: boolean;
}

export default function AdminDataImportPage() {
  const { toast } = useToast();

  const entitiesQ = useApiQuery<{ data: EntityMeta[] }>(["import-entities"], "/import/entities");
  const entities: EntityMeta[] = entitiesQ.data?.data ?? [];

  const [selectedEntity, setSelectedEntity] = useState("");
  const templateQ = useApiQuery<any>(
    ["import-template", selectedEntity],
    selectedEntity ? `/import/template/${encodeURIComponent(selectedEntity)}` : null,
    { enabled: !!selectedEntity },
  );

  const [rowsJson, setRowsJson] = useState("[]");
  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ variant: "destructive", title: "الملف فارغ أو بلا صفوف بيانات" });
        return;
      }
      setRowsJson(JSON.stringify(rows, null, 2));
      setFileName(file.name);
      setPreview(null);
      toast({
        title: `تم تحميل ${rows.length.toLocaleString("ar-SA")} صفاً من ${file.name}`,
        description: "راجع الصفوف ثم اضغط «معاينة»",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر قراءة الملف", description: err?.message || "" });
    } finally {
      e.target.value = "";
    }
  };

  const parseRows = (): any[] | null => {
    try {
      const parsed = JSON.parse(rowsJson);
      if (!Array.isArray(parsed)) throw new Error("expect array");
      return parsed;
    } catch (err: any) {
      toast({ variant: "destructive", title: "JSON غير صالح", description: err?.message || "" });
      return null;
    }
  };

  const handlePreview = async () => {
    if (!selectedEntity) {
      toast({ variant: "destructive", title: "اختر الكيان" });
      return;
    }
    const rows = parseRows();
    if (!rows) return;
    setPreviewing(true);
    try {
      const res = await apiFetch<any>("/import/preview", {
        method: "POST",
        body: JSON.stringify({ entity: selectedEntity, rows }),
      });
      setPreview(res);
      toast({ title: "اكتمل الفحص" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الفحص", description: err?.message || "خطأ" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedEntity) return;
    const rows = parseRows();
    if (!rows) return;
    setConfirming(true);
    try {
      const res = await apiFetch<any>("/import/confirm", {
        method: "POST",
        body: JSON.stringify({ entity: selectedEntity, rows, fileName: "manual-import" }),
      });
      toast({
        title: "تم التطبيق",
        description: `أُدخلت ${res?.inserted ?? 0}, حُدّثت ${res?.updated ?? 0}`,
      });
      setPreview(null);
      batchesQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التطبيق", description: err?.message || "خطأ" });
    } finally {
      setConfirming(false);
    }
  };

  const batchesQ = useApiQuery<{ data: any[] }>(
    ["import-batches", selectedEntity],
    selectedEntity
      ? `/import/batches?entity=${encodeURIComponent(selectedEntity)}&limit=20`
      : "/import/batches?limit=20",
  );
  const batches: any[] = batchesQ.data?.data ?? [];

  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  // URL kept as a non-conditional template literal so the wiring audit
  // can pattern-match it to /import/batches/:id. The fetch is gated by
  // `enabled` instead — when there's no selection, the URL is built
  // against the placeholder 0 but the query stays idle.
  const batchDetailQ = useApiQuery<any>(
    ["import-batch-detail", selectedBatchId == null ? "none" : String(selectedBatchId)],
    `/import/batches/${selectedBatchId ?? 0}`,
    { enabled: selectedBatchId !== null },
  );

  return (
    <PageShell
      title="استيراد البيانات (إداري)"
      subtitle="محرّك استيراد متعدد الكيانات للترحيلات الفردية والتصحيحات اليدوية"
      breadcrumbs={[{ label: "الإدارة" }, { label: "استيراد البيانات" }]}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" /> اختيار الكيان ({entities.length} متاح)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entitiesQ.isLoading ? <LoadingSpinner /> : entitiesQ.isError ? <ErrorState /> : (
              <div className="flex flex-wrap gap-2">
                {entities.map((e) => (
                  <button
                    key={e.entity}
                    type="button"
                    onClick={() => { setSelectedEntity(e.entity); setPreview(null); }}
                    className={`text-xs px-3 py-1.5 rounded border ${
                      selectedEntity === e.entity
                        ? "bg-status-info-surface border-status-info text-status-info-foreground"
                        : "bg-white"
                    }`}
                  >
                    <span className="font-mono">{e.entity}</span>
                    <span className="text-muted-foreground ms-2 text-[10px]">→ {e.table}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedEntity && templateQ.data && (
              <div className="border-t pt-2">
                <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> قالب الأعمدة ({templateQ.data.columns?.length ?? 0})
                </p>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {(templateQ.data.columns ?? []).map((c: any) => (
                    <Badge
                      key={c.field}
                      variant={c.required ? "default" : "outline"}
                      className="text-[10px]"
                      title={`الحقل: ${c.field} · النوع: ${c.type}${c.required ? " · مطلوب" : ""}`}
                    >
                      {c.arabic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">صفوف البيانات (CSV أو JSON)</CardTitle>
            <p className="text-xs text-muted-foreground">
              ارفع ملف CSV (الصف الأول رؤوس الأعمدة بأسماء الحقول الإنجليزية أو العربية من القالب)، أو الصق مصفوفة JSON مباشرة.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer rounded-md border px-3 py-1.5 hover:bg-surface-subtle">
                <Upload className="h-4 w-4" /> رفع ملف CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              </label>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <span className="text-xs text-muted-foreground">— الصفوف المُحمّلة تظهر أدناه للمراجعة والتعديل قبل الفحص.</span>
            </div>
            <textarea
              value={rowsJson}
              onChange={(e) => setRowsJson(e.target.value)}
              className="w-full h-40 px-3 py-2 border rounded text-xs font-mono"
              dir="ltr"
              placeholder='[{"name": "X", ...}]'
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePreview} disabled={previewing || !selectedEntity} rateLimitAware>
                <Eye className="h-3.5 w-3.5 me-1" />
                {previewing ? "جاري الفحص..." : "فحص (Preview)"}
              </Button>
              {preview && (
                <Button
                  size="sm"
                  variant="default"
                  rateLimitAware
                  onClick={handleConfirm}
                  disabled={confirming || (preview.errorRows?.length ?? 0) > 0}
                >
                  <CheckCircle className="h-3.5 w-3.5 me-1" />
                  {confirming ? "جاري التطبيق..." : "تطبيق (Confirm)"}
                </Button>
              )}
            </div>
            {preview && (
              <div className="p-2 bg-surface-subtle rounded text-xs space-y-1">
                <p>
                  إجمالي: <span className="font-mono">{preview.totalRows ?? 0}</span>
                  · جديد: <span className="font-mono">{preview.newRows?.length ?? 0}</span>
                  · تحديث: <span className="font-mono">{preview.updatedRows?.length ?? 0}</span>
                  · تخطي: <span className="font-mono">{preview.skippedCount ?? 0}</span>
                  · أخطاء: <span className="font-mono text-status-error-foreground">{preview.errorRows?.length ?? 0}</span>
                </p>
                {(preview.errorRows ?? []).slice(0, 5).map((er: any, i: number) => (
                  <p key={i} className="text-status-error-foreground">
                    صف {er.rowIndex ?? i}: {er.error ?? JSON.stringify(er)}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" /> آخر الدفعات ({batches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs">
              {batches.length === 0 ? (
                <p className="p-3 text-muted-foreground">لا توجد دفعات</p>
              ) : (
                batches.slice(0, 20).map((b: any) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(b.id === selectedBatchId ? null : b.id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-subtle text-right"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">#{b.id}</span>
                      <Badge variant="outline" className="text-[10px]">{b.entity ?? "—"}</Badge>
                      <span>{b.fileName ?? ""}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {b.insertedCount != null && <span>+{b.insertedCount} </span>}
                      {b.updatedCount != null && <span>~{b.updatedCount} </span>}
                      {b.createdAt && <span>· {formatDateAr(b.createdAt)}</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
            {selectedBatchId && batchDetailQ.data && (
              <div className="border-t p-3 bg-surface-subtle/30">
                <p className="text-xs font-semibold mb-1">دفعة #{selectedBatchId}</p>
                <pre className="text-[10px] max-h-40 overflow-y-auto">
                  {JSON.stringify(batchDetailQ.data, null, 2).slice(0, 800)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
