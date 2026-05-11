import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle, Eye } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { cn } from "@/lib/utils";

type FileType = "mutamers" | "vouchers";
type Step = "upload" | "preview" | "confirmed";

type RowDiff = {
  rowNumber: number;
  key: string;
  changeType: "created" | "updated" | "skipped" | "error";
  reason?: string;
  changedFields?: { field: string; oldValue: any; newValue: any }[];
  errorMessage?: string;
  hasFinancialImpact?: boolean;
  existingId?: number;
};

type PreviewSummary = {
  batchId: number;
  fileType: FileType;
  fileName: string;
  totalRows: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  financialImpactCount: number;
  manualReviewCount: number;
  newOverstays: number;
  newAbsconders: number;
  newAgents: number;
  newSubAgents: number;
  newGroups: number;
  unlinkedSubAgents: any[];
  errors: any[];
  sampleDiffs?: RowDiff[];
};

type ConfirmResult = {
  batchId: number;
  applied: {
    inserted: number; updated: number; skipped: number; errors: number;
    violationsCreated: number; purchaseInvoicesCreated: number;
    agentsCreated: number; subAgentsCreated: number; groupsCreated: number;
  };
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UmrahImportWizard() {
  const { toast } = useToast();
  const { data: seasonsResp } = useApiQuery<{ data: any[] }>(["umrah-seasons-list"], "/umrah/seasons");
  const seasons = seasonsResp?.data ?? [];

  const [fileType, setFileType] = useState<FileType>("mutamers");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const upload = async () => {
    if (!file || !seasonId) {
      toast({ variant: "destructive", title: "اختر الموسم والملف أولاً" });
      return;
    }
    setIsUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await apiFetch(`/umrah/import/preview/${fileType}`, {
        method: "POST",
        body: JSON.stringify({
          seasonId, fileName: file.name, fileSize: file.size, fileBase64,
        }),
      });
      setPreview(res as PreviewSummary);
      setStep("preview");
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "فشل تحليل الملف" });
    } finally {
      setIsUploading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setIsConfirming(true);
    try {
      const res = await apiFetch(`/umrah/import/confirm/${preview.batchId}`, { method: "POST" });
      setConfirmResult(res as ConfirmResult);
      setStep("confirmed");
      toast({ title: "تم تأكيد الاستيراد" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "فشل تأكيد الاستيراد" });
    } finally {
      setIsConfirming(false);
    }
  };

  const reject = async () => {
    if (!preview) return;
    if (!confirm) return;
    try {
      await apiFetch(`/umrah/import/reject/${preview.batchId}`, { method: "POST" });
      toast({ title: "تم إلغاء الدفعة" });
      reset();
    } catch {
      toast({ variant: "destructive", title: "فشل الإلغاء" });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setConfirmResult(null);
    setStep("upload");
  };

  return (
    <PageShell
      title="استيراد ملفات نسك"
      breadcrumbs={[{ label: "العمرة" }, { label: "الاستيراد" }]}
    >
      <UmrahTabsNav />

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {(["upload", "preview", "confirmed"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs",
              step === s ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>{i + 1}</div>
            <span>
              {s === "upload" ? "رفع الملف" : s === "preview" ? "المعاينة" : "تأكيد التطبيق"}
            </span>
            {i < 2 && <span className="text-muted-foreground">←</span>}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <Card>
          <CardHeader><CardTitle>اختر نوع الملف والموسم</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>نوع الملف</Label>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setFileType("mutamers")}
                  className={cn(
                    "flex-1 border-2 rounded-lg p-4 text-right transition",
                    fileType === "mutamers" ? "border-primary bg-primary/5" : "border-gray-200"
                  )}
                >
                  <div className="font-bold">ملف المعتمرين</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    35 عمود — رقم المعتمر في النظام كمفتاح فريد
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFileType("vouchers")}
                  className={cn(
                    "flex-1 border-2 rounded-lg p-4 text-right transition",
                    fileType === "vouchers" ? "border-primary bg-primary/5" : "border-gray-200"
                  )}
                >
                  <div className="font-bold">ملف الفواتير</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    24 عمود — رقم الفاتورة كمفتاح فريد
                  </div>
                </button>
              </div>
            </div>

            <div>
              <Label>الموسم *</Label>
              <select
                className="w-full border rounded-md p-2 mt-2"
                value={seasonId ?? ""}
                onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— اختر الموسم —</option>
                {seasons.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <label htmlFor="file-input" className="cursor-pointer">
                {file ? (
                  <div>
                    <FileSpreadsheet className="w-12 h-12 mx-auto text-primary mb-2" />
                    <div className="font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                    <div className="font-medium">اسحب الملف هنا أو اضغط للاختيار</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Excel (.xlsx, .xls) — حتى 50 ميجابايت
                    </div>
                  </div>
                )}
              </label>
            </div>

            <div className="flex justify-end gap-2">
              {file && <Button variant="outline" onClick={() => setFile(null)}>إزالة الملف</Button>}
              <Button onClick={upload} disabled={!file || !seasonId || isUploading} className="gap-2">
                <Eye className="h-4 w-4" />
                {isUploading ? "جاري التحليل..." : "معاينة الاستيراد"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>ملخص المعاينة — {preview.fileName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryTile color="green" label="سجلات جديدة" value={preview.newCount} />
                <SummaryTile color="blue" label="سجلات مُحدَّثة" value={preview.updatedCount} />
                <SummaryTile color="gray" label="بدون تغيير" value={preview.skippedCount} />
                <SummaryTile color="red" label="أخطاء" value={preview.errorCount} />
                {preview.fileType === "mutamers" && (
                  <>
                    <SummaryTile color="orange" label="متجاوزون جدد" value={preview.newOverstays} />
                    <SummaryTile color="red" label="متغيّبون جدد" value={preview.newAbsconders} />
                  </>
                )}
                <SummaryTile color="purple" label="وكلاء جدد" value={preview.newAgents} />
                <SummaryTile color="purple" label="وكلاء فرعيون جدد" value={preview.newSubAgents} />
                <SummaryTile color="purple" label="مجموعات جديدة" value={preview.newGroups} />
                <SummaryTile color="orange" label="أثر مالي" value={preview.financialImpactCount} />
                <SummaryTile color="orange" label="مراجعة يدوية" value={preview.manualReviewCount} />
              </div>

              {preview.unlinkedSubAgents.length > 0 && (
                <div className="mt-4 border border-orange-200 bg-orange-50 rounded p-3">
                  <div className="flex items-center gap-2 font-medium text-orange-800 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    {preview.unlinkedSubAgents.length} وكيل فرعي غير مربوط بعميل
                  </div>
                  <div className="text-xs text-orange-700">
                    سيتم إنشاؤهم تلقائياً، لكن لن يمكن إصدار فواتير مبيعات حتى يتم ربطهم بعملاء.
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {preview.unlinkedSubAgents.slice(0, 10).map((s, i) => (
                      <li key={i} className="text-orange-900">
                        • {s.name}{s.country ? ` (${s.country})` : ""} — {s.occurrences} معتمر
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="mt-4 border border-red-200 bg-red-50 rounded p-3">
                  <div className="font-medium text-red-800 mb-2">{preview.errors.length} خطأ</div>
                  <ul className="space-y-1 text-xs text-red-700 max-h-32 overflow-y-auto">
                    {preview.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>صف {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.sampleDiffs && preview.sampleDiffs.length > 0 && (
                <div className="mt-4">
                  <div className="font-medium text-sm mb-2">
                    تفاصيل التغييرات (أول {Math.min(50, preview.sampleDiffs.length)} صف)
                  </div>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-right p-2 w-12">صف</th>
                          <th className="text-right p-2">المفتاح</th>
                          <th className="text-right p-2 w-20">النوع</th>
                          <th className="text-right p-2">الحقول المتغيّرة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sampleDiffs.slice(0, 50).map((d, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 text-muted-foreground">{d.rowNumber}</td>
                            <td className="p-2 font-mono">{d.key}</td>
                            <td className="p-2">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-xs",
                                d.changeType === "created" && "bg-green-100 text-green-800",
                                d.changeType === "updated" && "bg-blue-100 text-blue-800",
                                d.changeType === "skipped" && "bg-slate-100 text-slate-700",
                                d.changeType === "error" && "bg-red-100 text-red-800"
                              )}>
                                {d.changeType === "created" ? "جديد"
                                  : d.changeType === "updated" ? "محدّث"
                                  : d.changeType === "skipped" ? "بدون تغيير"
                                  : "خطأ"}
                              </span>
                              {d.hasFinancialImpact && (
                                <span className="ml-1 text-orange-600 text-[10px]">●مالي</span>
                              )}
                            </td>
                            <td className="p-2">
                              {d.changeType === "updated" && d.changedFields ? (
                                <div className="space-y-1">
                                  {d.changedFields.slice(0, 4).map((f, j) => (
                                    <div key={j} className="text-[11px]">
                                      <span className="text-slate-600">{f.field}:</span>
                                      <span className="text-red-700 line-through ml-1">{String(f.oldValue ?? "—")}</span>
                                      <span className="text-green-700 mx-1">→</span>
                                      <span className="text-green-700">{String(f.newValue ?? "—")}</span>
                                    </div>
                                  ))}
                                  {d.changedFields.length > 4 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      +{d.changedFields.length - 4} حقل آخر
                                    </div>
                                  )}
                                </div>
                              ) : d.changeType === "error" ? (
                                <span className="text-red-700">{d.errorMessage ?? "خطأ"}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reject} className="gap-2">
              <XCircle className="h-4 w-4" />إلغاء الدفعة
            </Button>
            <Button onClick={confirm} disabled={isConfirming} className="gap-2 bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4" />
              {isConfirming ? "جاري التطبيق..." : "تأكيد التطبيق"}
            </Button>
          </div>
        </>
      )}

      {step === "confirmed" && confirmResult && (
        <Card>
          <CardHeader><CardTitle className="text-green-700 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />تم تأكيد الاستيراد بنجاح
          </CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryTile color="green" label="تم إدراجهم" value={confirmResult.applied.inserted} />
              <SummaryTile color="blue" label="تم تحديثهم" value={confirmResult.applied.updated} />
              <SummaryTile color="gray" label="تم تخطّيهم" value={confirmResult.applied.skipped} />
              <SummaryTile color="red" label="أخطاء" value={confirmResult.applied.errors} />
              <SummaryTile color="orange" label="مخالفات أُنشئت" value={confirmResult.applied.violationsCreated} />
              <SummaryTile color="purple" label="فواتير شراء" value={confirmResult.applied.purchaseInvoicesCreated} />
              <SummaryTile color="purple" label="وكلاء جدد" value={confirmResult.applied.agentsCreated} />
              <SummaryTile color="purple" label="مجموعات جديدة" value={confirmResult.applied.groupsCreated} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={reset}>استيراد ملف آخر</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function SummaryTile({ color, label, value }: { color: string; label: string; value: number }) {
  const palette: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    gray: "bg-gray-50 text-gray-700 border-gray-200",
    red: "bg-red-50 text-red-700 border-red-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <div className={cn("border rounded p-3", palette[color] ?? palette.gray)}>
      <div className="text-xs font-medium opacity-75">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString("ar-SA")}</div>
    </div>
  );
}
