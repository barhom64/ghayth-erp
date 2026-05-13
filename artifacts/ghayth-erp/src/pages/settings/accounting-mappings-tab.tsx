import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight, CheckCircle, AlertCircle, AlertTriangle, Save, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function AccountingMappingsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["accounting-mappings"], "/finance/accounting-mappings");
  const { data: accountsData } = useApiQuery<any>(["accounts-list"], "/finance/accounts");
  const { toast } = useToast();
  const mappings: any[] = data?.data || [];
  const accounts: any[] = accountsData?.data || [];
  const [editingMap, setEditingMap] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const postingAccounts = accounts.filter((a: any) => a.allowPosting !== false);

  const handleChange = (operationType: string, field: string, value: any) => {
    setEditingMap(prev => ({
      ...prev,
      [operationType]: { ...(prev[operationType] || {}), [field]: value }
    }));
  };

  const handleSave = async (operationType: string, original: any) => {
    setSaving(operationType);
    const edits = editingMap[operationType] || {};
    const payload = { ...original, ...edits };
    try {
      await apiFetch(`/finance/accounting-mappings/${operationType}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: `تم حفظ توجيه "${original.operationLabel}"` });
      setEditingMap(prev => { const n = { ...prev }; delete n[operationType]; return n; });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const getValue = (mapping: any, field: string) => {
    const edits = editingMap[mapping.operationType];
    return edits && edits[field] !== undefined ? edits[field] : (mapping[field] ?? "");
  };

  const isModified = (operationType: string) => !!editingMap[operationType] && Object.keys(editingMap[operationType]).length > 0;

  const isMappingComplete = (mapping: any) => {
    const debit = editingMap[mapping.operationType]?.debitAccountId ?? mapping.debitAccountId;
    const credit = editingMap[mapping.operationType]?.creditAccountId ?? mapping.creditAccountId;
    return !!debit && !!credit;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-status-info-foreground" />
        <h3 className="text-lg font-semibold">التوجيه المحاسبي</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        حدد الحساب المدين والدائن الافتراضيين لكل نوع عملية. يُمنع اعتماد أي عملية مالية إذا لم يكتمل توجيهها المحاسبي.
      </p>

      {isLoading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {mappings.map((mapping: any) => {
            const complete = isMappingComplete(mapping);
            const modified = isModified(mapping.operationType);
            return (
              <Card key={mapping.operationType} className={`border-s-4 ${complete ? "border-s-green-400" : "border-s-orange-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {complete ? (
                        <CheckCircle className="h-4 w-4 text-status-success" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                      <span className="font-medium text-sm">{mapping.operationLabel}</span>
                      <Badge className="text-xs bg-surface-subtle text-muted-foreground font-mono">{mapping.operationType}</Badge>
                    </div>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">الحساب المدين</Label>
                      <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={getValue(mapping, "debitAccountId")}
                        onChange={(e) => handleChange(mapping.operationType, "debitAccountId", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-- اختر الحساب المدين --</option>
                        {postingAccounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                      {mapping.debitName && !editingMap[mapping.operationType]?.debitAccountId && (
                        <p className="text-xs text-status-success-foreground mt-1">✓ {mapping.debitCode} — {mapping.debitName}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">الحساب الدائن</Label>
                      <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={getValue(mapping, "creditAccountId")}
                        onChange={(e) => handleChange(mapping.operationType, "creditAccountId", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-- اختر الحساب الدائن --</option>
                        {postingAccounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                      {mapping.creditName && !editingMap[mapping.operationType]?.creditAccountId && (
                        <p className="text-xs text-status-success-foreground mt-1">✓ {mapping.creditCode} — {mapping.creditName}</p>
                      )}
                    </div>
                  </div>

                  {!complete && (
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
            <Card><CardContent className="p-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد بيانات توجيه محاسبي</p>
            </CardContent></Card>
          )}
        </div>
      )}

      <div className="mt-4 p-4 bg-status-info-surface rounded-lg text-sm text-status-info-foreground border border-status-info-surface">
        <p className="font-medium mb-1">ملاحظة</p>
        <ul className="text-xs space-y-1 text-status-info-foreground list-disc list-inside">
          <li>يتم التحقق من اكتمال التوجيه المحاسبي قبل اعتماد أي عملية مالية</li>
          <li>يمكن إنشاء قوالب قيود مخصصة لكل نوع عملية من قسم "قوالب القيود" في المالية</li>
          <li>الحسابات التحليلية الفرعية تُنشأ تلقائياً عند إضافة موظف أو عميل جديد</li>
        </ul>
      </div>
    </div>
  );
}
