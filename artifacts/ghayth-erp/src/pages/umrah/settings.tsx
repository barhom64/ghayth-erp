import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Settings as SettingsIcon, Save, AlertTriangle } from "lucide-react";

interface UmrahSettings {
  nuskSupplierId: number | null;
  nuskSupplierName: string | null;
  nuskSupplierCode: string | null;
}

interface Supplier {
  id: number;
  name: string;
  code?: string | null;
}

export default function UmrahSettings() {
  const { toast } = useToast();

  // Current settings — read once on mount, then `nuskSupplierId` state
  // tracks the operator's edits independently so a re-render doesn't
  // wipe their selection.
  const { data: settings, isLoading, isError, refetch } = useApiQuery<UmrahSettings>(
    ["umrah-settings"],
    "/umrah/settings",
  );
  // Suppliers feed the SearchableSelect — the operator picks the one
  // that represents NUSK. Fetched once and cached.
  const { data: suppliersResp } = useApiQuery<{ data: Supplier[] }>(
    ["finance-vendors"],
    "/finance/vendors",
  );
  const suppliers: Supplier[] = suppliersResp?.data ?? [];

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Sync local state when the settings load — keeps the dropdown's
  // initial value in sync with the server's persisted setting.
  useEffect(() => {
    if (settings?.nuskSupplierId != null) {
      setSelectedSupplierId(String(settings.nuskSupplierId));
    } else if (settings) {
      // Explicitly empty when settings load and nuskSupplierId is null
      // — the operator hasn't configured it yet.
      setSelectedSupplierId("");
    }
  }, [settings?.nuskSupplierId]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/umrah/settings", {
        method: "PATCH",
        body: JSON.stringify({
          // Empty string maps to null on the backend — clears the link.
          nuskSupplierId: selectedSupplierId === "" ? null : Number(selectedSupplierId),
        }),
      });
      toast({ title: "تم حفظ إعدادات العمرة" });
      refetch();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "خطأ في الحفظ",
        description: e?.message ?? "فشل تحديث الإعدادات",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const dirty = selectedSupplierId !== (settings?.nuskSupplierId != null ? String(settings.nuskSupplierId) : "");

  return (
    <PageShell title="إعدادات العمرة" subtitle="ضبط ربط وحدة العمرة بالنظام المالي">
      <UmrahTabsNav />
      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              ربط مورد نسك (NUSK)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر سجلّ المورد الذي يمثّل هيئة NUSK في نظامك. عند فتح كشف حساب هذا المورد في المالية،
              ستظهر جميع فواتير نسك المستوردة ضمن الرصيد المستحق والتقادم تلقائياً.
            </p>

            <div className="space-y-2" data-testid="nusk-supplier-select">
              <Label>مورد NUSK الافتراضي</Label>
              <SearchableSelect
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
                placeholder="— لم يُحدّد بعد —"
                options={[
                  { value: "", label: "— لا مورد —" },
                  ...suppliers.map((s) => ({
                    value: String(s.id),
                    label: s.code ? `${s.name} (${s.code})` : s.name,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                هل لم تُسجّل مورد NUSK بعد؟ أنشئه من{" "}
                <a href="/finance/vendors/create" className="text-status-info-foreground hover:underline">
                  المالية ← الموردون
                </a>{" "}
                ثم ارجع هنا لربطه.
              </p>
            </div>

            {settings?.nuskSupplierId == null && (
              <div className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3 text-sm text-status-warning-foreground flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  لم يتم تحديد مورد NUSK بعد. كشف حساب المورد لن يضمّ فواتير نسك حتى تعيّن الإعداد.
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <GuardedButton
                perm="umrah:update"
                onClick={save}
                disabled={!dirty || saving}
                data-testid="umrah-settings-save"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
