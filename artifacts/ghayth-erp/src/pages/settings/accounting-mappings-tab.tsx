import { useState, useMemo } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftRight,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Save,
  BookOpen,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { SearchableSelect } from "@/components/shared/searchable-select";

/**
 * Settings / Accounting Mappings tab.
 *
 * Phase D / Finance gap. Closes 3 unused-backend endpoints by
 * extending the existing tab (rather than building a parallel
 * page, since this is the canonical home for the feature):
 *
 *   POST /finance/accounting-mappings/batch
 *     → "حفظ كل التعديلات" button that flushes every dirty row
 *       in one round-trip. Useful when an operator edits a dozen
 *       mappings at once during the chart-of-accounts setup.
 *
 *   GET  /finance/accounting-mappings/:operationType
 *     → "تحديث" per-row refresh that re-fetches a single mapping
 *       — handy when another user just edited the same row.
 *
 *   GET  /finance/accounting-mappings/:operationType/validate
 *     → "تحقق" per-row validate button. The same validator runs
 *       server-side before any financial operation is approved
 *       (see validateAccountingMapping in routes/accounting-engine.ts),
 *       so exposing it as a manual lever lets ops confirm the
 *       mapping is approval-ready before posting real journals.
 *
 * The native <select> got replaced with SearchableSelect so the
 * picker stays usable when the chart of accounts grows past ~50
 * postable rows (search by code or name). Original behaviour
 * (per-row edit + per-row save, completeness badge, info panel)
 * is preserved.
 */

interface MappingRow {
  operationType: string;
  operationLabel: string;
  debitAccountId: number | null;
  creditAccountId: number | null;
  debitCode: string | null;
  debitName: string | null;
  creditCode: string | null;
  creditName: string | null;
}

interface ValidateResult {
  valid: boolean;
  error?: string;
}

export function AccountingMappingsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<{ data: MappingRow[] }>(
    ["accounting-mappings"],
    "/finance/accounting-mappings",
  );
  const { data: accountsData } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );
  const { toast } = useToast();
  const mappings: MappingRow[] = data?.data || [];
  const accounts: any[] = accountsData?.data || [];
  const [editingMap, setEditingMap] = useState<Record<string, Partial<MappingRow>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ValidateResult>>({});

  const postingAccounts = useMemo(
    () => accounts.filter((a: any) => a.allowPosting !== false),
    [accounts],
  );

  const accountOptions = useMemo(
    () =>
      postingAccounts.map((acc: any) => ({
        value: String(acc.id),
        label: `${acc.code} — ${acc.name}`,
      })),
    [postingAccounts],
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleChange = (operationType: string, field: keyof MappingRow, value: any) => {
    setEditingMap((prev) => ({
      ...prev,
      [operationType]: { ...(prev[operationType] || {}), [field]: value },
    }));
    setValidationResults((prev) => {
      const n = { ...prev };
      delete n[operationType];
      return n;
    });
  };

  const handleSave = async (operationType: string, original: MappingRow) => {
    setSaving(operationType);
    const edits = editingMap[operationType] || {};
    const payload = { ...original, ...edits };
    try {
      await apiFetch(`/finance/accounting-mappings/${operationType}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: `تم حفظ توجيه "${original.operationLabel}"` });
      setEditingMap((prev) => {
        const n = { ...prev };
        delete n[operationType];
        return n;
      });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  // Batch save flushes every dirty row in one POST /batch call.
  // The backend uses ON CONFLICT (companyId, operationType) DO UPDATE,
  // so this is idempotent and safe to retry.
  const handleBatchSave = async () => {
    const dirty = Object.entries(editingMap).filter(([, v]) => Object.keys(v).length > 0);
    if (dirty.length === 0) {
      toast({ title: "لا تعديلات", description: "لا توجد تغييرات للحفظ" });
      return;
    }
    setBatchSaving(true);
    try {
      const items = dirty.map(([operationType, edits]) => {
        const original = mappings.find((m) => m.operationType === operationType);
        return {
          operationType,
          operationLabel: original?.operationLabel,
          debitAccountId: edits.debitAccountId ?? original?.debitAccountId ?? null,
          creditAccountId: edits.creditAccountId ?? original?.creditAccountId ?? null,
        };
      });
      await apiFetch("/finance/accounting-mappings/batch", {
        method: "POST",
        body: JSON.stringify({ mappings: items }),
      });
      toast({ title: "تم الحفظ", description: `تم حفظ ${items.length} توجيه دفعة واحدة` });
      setEditingMap({});
      refetch();
    } catch (e: any) {
      toast({
        title: "خطأ في الحفظ الجماعي",
        description: e.message || "فشل الحفظ",
        variant: "destructive",
      });
    } finally {
      setBatchSaving(false);
    }
  };

  // Single-row refresh via GET /:operationType — useful if a teammate
  // edited the same row from another session. Updates the local row
  // by patching it back into the cached list.
  const handleRefreshOne = async (operationType: string) => {
    try {
      const fresh = await apiFetch<MappingRow>(`/finance/accounting-mappings/${operationType}`);
      // Mutating the cached row in-place via refetch is the cleanest
      // path — we don't expose a setter for the useApiQuery cache, so
      // a full refetch keeps things consistent with the rest of the UI.
      refetch();
      toast({
        title: "تم التحديث",
        description: `${fresh.operationLabel} (${fresh.operationType})`,
      });
    } catch (e: any) {
      toast({ title: "تعذر التحديث", description: e.message, variant: "destructive" });
    }
  };

  // Server-side validate — same predicate that gates real financial
  // operations. Surfaces the exact rejection message ops would see at
  // approval time, so they can fix the mapping pre-emptively.
  const handleValidate = async (operationType: string) => {
    setValidating(operationType);
    try {
      const result = await apiFetch<ValidateResult>(
        `/finance/accounting-mappings/${operationType}/validate`,
      );
      setValidationResults((prev) => ({ ...prev, [operationType]: result }));
      toast({
        title: result.valid ? "التوجيه مكتمل" : "التوجيه غير مكتمل",
        description: result.valid
          ? "يمكن اعتماد العمليات من هذا النوع"
          : result.error || "—",
        variant: result.valid ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "خطأ في التحقق", description: e.message, variant: "destructive" });
    } finally {
      setValidating(null);
    }
  };

  const getValue = (mapping: MappingRow, field: keyof MappingRow): string => {
    const edits = editingMap[mapping.operationType];
    const v = edits && edits[field] !== undefined ? edits[field] : mapping[field];
    return v != null ? String(v) : "";
  };

  const isModified = (operationType: string) =>
    !!editingMap[operationType] && Object.keys(editingMap[operationType]).length > 0;

  const isMappingComplete = (mapping: MappingRow) => {
    const debit = editingMap[mapping.operationType]?.debitAccountId ?? mapping.debitAccountId;
    const credit = editingMap[mapping.operationType]?.creditAccountId ?? mapping.creditAccountId;
    return !!debit && !!credit;
  };

  const dirtyCount = Object.values(editingMap).filter((v) => Object.keys(v).length > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-status-info-foreground" />
          <h3 className="text-lg font-semibold">التوجيه المحاسبي</h3>
        </div>
        {dirtyCount > 0 && (
          <GuardedButton
            perm="settings:create"
            size="sm"
            onClick={handleBatchSave}
            disabled={batchSaving}
            className="gap-1.5"
          >
            {batchSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            حفظ كل التعديلات ({dirtyCount})
          </GuardedButton>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        حدد الحساب المدين والدائن الافتراضيين لكل نوع عملية. يُمنع اعتماد أي عملية مالية إذا لم يكتمل توجيهها المحاسبي.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {mappings.map((mapping) => {
            const complete = isMappingComplete(mapping);
            const modified = isModified(mapping.operationType);
            const validation = validationResults[mapping.operationType];
            return (
              <Card
                key={mapping.operationType}
                className={`border-s-4 ${complete ? "border-s-green-400" : "border-s-orange-400"}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {complete ? (
                        <CheckCircle className="h-4 w-4 text-status-success" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                      <span className="font-medium text-sm">{mapping.operationLabel}</span>
                      <Badge className="text-xs bg-surface-subtle text-muted-foreground font-mono">
                        {mapping.operationType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleValidate(mapping.operationType)}
                        disabled={validating === mapping.operationType}
                        className="gap-1"
                      >
                        {validating === mapping.operationType ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3 w-3" />
                        )}
                        تحقق
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRefreshOne(mapping.operationType)}
                      >
                        تحديث
                      </Button>
                      {modified && (
                        <GuardedButton
                          perm="settings:create"
                          size="sm"
                          onClick={() => handleSave(mapping.operationType, mapping)}
                          disabled={saving === mapping.operationType}
                        >
                          <Save className="h-3 w-3 me-1" />
                          {saving === mapping.operationType ? "جاري الحفظ..." : "حفظ"}
                        </GuardedButton>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">الحساب المدين</Label>
                      <SearchableSelect
                        options={accountOptions}
                        value={getValue(mapping, "debitAccountId")}
                        onValueChange={(v) =>
                          handleChange(
                            mapping.operationType,
                            "debitAccountId",
                            v ? Number(v) : null,
                          )
                        }
                        placeholder="اختر الحساب المدين"
                        searchPlaceholder="ابحث برقم أو اسم الحساب..."
                        emptyText="لا توجد حسابات"
                      />
                      {mapping.debitName && !editingMap[mapping.operationType]?.debitAccountId && (
                        <p className="text-xs text-status-success-foreground mt-1">
                          ✓ {mapping.debitCode} — {mapping.debitName}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">الحساب الدائن</Label>
                      <SearchableSelect
                        options={accountOptions}
                        value={getValue(mapping, "creditAccountId")}
                        onValueChange={(v) =>
                          handleChange(
                            mapping.operationType,
                            "creditAccountId",
                            v ? Number(v) : null,
                          )
                        }
                        placeholder="اختر الحساب الدائن"
                        searchPlaceholder="ابحث برقم أو اسم الحساب..."
                        emptyText="لا توجد حسابات"
                      />
                      {mapping.creditName && !editingMap[mapping.operationType]?.creditAccountId && (
                        <p className="text-xs text-status-success-foreground mt-1">
                          ✓ {mapping.creditCode} — {mapping.creditName}
                        </p>
                      )}
                    </div>
                  </div>

                  {validation && (
                    <p
                      className={`text-xs mt-2 flex items-center gap-1 ${
                        validation.valid
                          ? "text-status-success-foreground"
                          : "text-status-error-foreground"
                      }`}
                    >
                      {validation.valid ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {validation.valid
                        ? "التوجيه مكتمل وجاهز للاستخدام"
                        : validation.error || "التوجيه غير مكتمل"}
                    </p>
                  )}

                  {!complete && !validation && (
                    <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      لا يمكن اعتماد العمليات من هذا النوع لعدم اكتمال التوجيه المحاسبي
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {mappings.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد بيانات توجيه محاسبي</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="mt-4 p-4 bg-status-info-surface rounded-lg text-sm text-status-info-foreground border border-status-info-surface">
        <p className="font-medium mb-1">ملاحظة</p>
        <ul className="text-xs space-y-1 text-status-info-foreground list-disc list-inside">
          <li>يتم التحقق من اكتمال التوجيه المحاسبي قبل اعتماد أي عملية مالية</li>
          <li>زر "تحقق" يستدعي نفس فحص الخادم الذي يجري عند الاعتماد، فيُظهر سبب الرفض المتوقع قبل الترحيل</li>
          <li>عند تعديل عدة توجيهات تظهر "حفظ كل التعديلات" لإرسالها دفعة واحدة</li>
          <li>الحسابات التحليلية الفرعية تُنشأ تلقائياً عند إضافة موظف أو عميل جديد</li>
        </ul>
      </div>
    </div>
  );
}
