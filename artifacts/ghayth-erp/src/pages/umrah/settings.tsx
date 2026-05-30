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
import { Settings as SettingsIcon, Save, AlertTriangle, Wallet, Package } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface UmrahSettings {
  nuskSupplierId: number | null;
  nuskSupplierName: string | null;
  nuskSupplierCode: string | null;
  // Phase 3a (PR #1469) — service-type → product mapping. Each may
  // be null pre-configuration; the Phase 3b engine resolver falls
  // back to the bundled single-line behaviour in that case.
  umrahVisaProductId: number | null;
  umrahVisaProductName: string | null;
  umrahServicesProductId: number | null;
  umrahServicesProductName: string | null;
  umrahTransportProductId: number | null;
  umrahTransportProductName: string | null;
}

interface Product {
  id: number;
  name: string;
  defaultTaxCode?: string | null;
}

interface NuskWallet {
  configured: boolean;
  nuskSupplierId: number | null;
  walletBalance: number;
  totalDeposits: number;
  totalObligations: number;
  totalRefunds: number;
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
  // NUSK wallet balance — derived view over the existing AP ledger.
  // Re-fetched alongside settings so the balance reflects any saves
  // (though saves don't change wallet balance, defensive consistency).
  const { data: wallet, refetch: refetchWallet } = useApiQuery<NuskWallet>(
    ["umrah-nusk-wallet"],
    "/umrah/nusk-wallet",
  );
  // Suppliers feed the SearchableSelect — the operator picks the one
  // that represents NUSK. Fetched once and cached.
  const { data: suppliersResp } = useApiQuery<{ data: Supplier[] }>(
    ["finance-vendors"],
    "/finance/vendors",
  );
  const suppliers: Supplier[] = suppliersResp?.data ?? [];

  // Products list feeds the 3 service-type dropdowns (Phase 3a). The
  // canonical products list endpoint lives under /warehouse/products
  // — products are warehouse-domain entities (with stock, inventory
  // account, etc.) even though they're picked here for revenue
  // routing. The defaultTaxCode (when present) is surfaced in the
  // option label so the operator can confirm they picked a
  // zero-rated product for visa, not a 15% one.
  const { data: productsResp } = useApiQuery<{ data: Product[] }>(
    ["warehouse-products"],
    "/warehouse/products",
  );
  const products: Product[] = productsResp?.data ?? [];

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedVisaProductId, setSelectedVisaProductId] = useState<string>("");
  const [selectedServicesProductId, setSelectedServicesProductId] = useState<string>("");
  const [selectedTransportProductId, setSelectedTransportProductId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Sync local state when the settings load — keeps the dropdowns'
  // initial values in sync with the server's persisted settings.
  // Each field has its own effect so that a save of ONE setting
  // doesn't accidentally re-sync the others (which would lose the
  // operator's in-flight edits).
  useEffect(() => {
    if (settings == null) return;
    setSelectedSupplierId(settings.nuskSupplierId != null ? String(settings.nuskSupplierId) : "");
  }, [settings?.nuskSupplierId]);
  useEffect(() => {
    if (settings == null) return;
    setSelectedVisaProductId(settings.umrahVisaProductId != null ? String(settings.umrahVisaProductId) : "");
  }, [settings?.umrahVisaProductId]);
  useEffect(() => {
    if (settings == null) return;
    setSelectedServicesProductId(settings.umrahServicesProductId != null ? String(settings.umrahServicesProductId) : "");
  }, [settings?.umrahServicesProductId]);
  useEffect(() => {
    if (settings == null) return;
    setSelectedTransportProductId(settings.umrahTransportProductId != null ? String(settings.umrahTransportProductId) : "");
  }, [settings?.umrahTransportProductId]);

  // Helper: convert a SearchableSelect value ("" / "<number>") to the
  // wire format the PR #1469 PATCH expects ("" → null, value → Number).
  const toPatchValue = (v: string): number | null => (v === "" ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/umrah/settings", {
        method: "PATCH",
        body: JSON.stringify({
          // Each field's "" maps to null on the backend (clears the link).
          // The PATCH handler treats null as "explicit clear" and value
          // as "update" — see umrahSettingsPatchSchema docstring.
          nuskSupplierId: toPatchValue(selectedSupplierId),
          umrahVisaProductId: toPatchValue(selectedVisaProductId),
          umrahServicesProductId: toPatchValue(selectedServicesProductId),
          umrahTransportProductId: toPatchValue(selectedTransportProductId),
        }),
      });
      toast({ title: "تم حفظ إعدادات العمرة" });
      refetch();
      refetchWallet();
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

  // Dirty check — any of the 4 fields differs from its loaded value.
  // The save button stays disabled until SOMETHING changes so we
  // don't fire useless audit-log entries on every page revisit.
  const dirty =
    selectedSupplierId !== (settings?.nuskSupplierId != null ? String(settings.nuskSupplierId) : "") ||
    selectedVisaProductId !== (settings?.umrahVisaProductId != null ? String(settings.umrahVisaProductId) : "") ||
    selectedServicesProductId !== (settings?.umrahServicesProductId != null ? String(settings.umrahServicesProductId) : "") ||
    selectedTransportProductId !== (settings?.umrahTransportProductId != null ? String(settings.umrahTransportProductId) : "");

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

        {/* Service-type → product mapping (Phase 3a, PR #1469).
            Lets the operator pick which products represent visa /
            services / transport on umrah sales invoices. Phase 3b
            uses these to split each group line into 3 properly-VAT'd
            sub-lines so e-invoices show "visa zero-rated" and
            "services 15%" distinctly — matching ZATCA + the
            "تأشيرة 422 + خدمات 50 + نقل 200" example. */}
        <Card data-testid="umrah-service-products-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              ربط أنواع الخدمة بالمنتجات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              يربط كل نوع خدمة بمنتج في سجل المنتجات. الـ
              <strong> defaultTaxCode </strong>
              على المنتج هو المصدر الحقيقي لنسبة الضريبة (مثلاً
              <span dir="ltr"> "zero" </span>
              للتأشيرة،
              <span dir="ltr"> "standard" </span>
              للخدمات والنقل). الفاتورة بعدها تظهر كل بند بنسبته الصحيحة في كشف ZATCA.
            </p>

            {(settings?.umrahVisaProductId == null
              || settings?.umrahServicesProductId == null
              || settings?.umrahTransportProductId == null) && (
              <div
                className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3 text-sm text-status-warning-foreground flex items-start gap-2"
                data-testid="service-products-incomplete-banner"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  لم تُكتمل خريطة المنتجات. حتى تربط الثلاثة، يُسجّل المحرّك كل مجموعة كبند واحد دون فصل
                  (تأشيرة / خدمات / نقل). أكمل الربط ليتم التقسيم تلقائياً.
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2" data-testid="umrah-visa-product-select">
                <Label>منتج التأشيرة (بدون ضريبة)</Label>
                <SearchableSelect
                  value={selectedVisaProductId}
                  onValueChange={setSelectedVisaProductId}
                  placeholder="— لم يُحدّد —"
                  options={[
                    { value: "", label: "— لا منتج —" },
                    ...products.map((p) => ({
                      value: String(p.id),
                      label: p.defaultTaxCode ? `${p.name} [${p.defaultTaxCode}]` : p.name,
                    })),
                  ]}
                />
              </div>

              <div className="space-y-2" data-testid="umrah-services-product-select">
                <Label>منتج الخدمات الأرضية (15%)</Label>
                <SearchableSelect
                  value={selectedServicesProductId}
                  onValueChange={setSelectedServicesProductId}
                  placeholder="— لم يُحدّد —"
                  options={[
                    { value: "", label: "— لا منتج —" },
                    ...products.map((p) => ({
                      value: String(p.id),
                      label: p.defaultTaxCode ? `${p.name} [${p.defaultTaxCode}]` : p.name,
                    })),
                  ]}
                />
              </div>

              <div className="space-y-2" data-testid="umrah-transport-product-select">
                <Label>منتج النقل (15%)</Label>
                <SearchableSelect
                  value={selectedTransportProductId}
                  onValueChange={setSelectedTransportProductId}
                  placeholder="— لم يُحدّد —"
                  options={[
                    { value: "", label: "— لا منتج —" },
                    ...products.map((p) => ({
                      value: String(p.id),
                      label: p.defaultTaxCode ? `${p.name} [${p.defaultTaxCode}]` : p.name,
                    })),
                  ]}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              لم تُنشئ المنتجات بعد؟ أنشئها من{" "}
              <a href="/finance/product-catalog" className="text-status-info-foreground hover:underline">
                المالية ← كتالوج المنتجات
              </a>{" "}
              ثم ارجع هنا للربط.
            </p>
          </CardContent>
        </Card>

        {/* NUSK wallet card — derived view of the operator's prepayment
            balance with NUSK. NOT a separate wallet system; it's the
            running balance of the NUSK supplier in the standard AP
            ledger, so this view stays in sync with the vendor
            statement (PR #1453) automatically. */}
        {wallet?.configured && (
          <Card data-testid="nusk-wallet-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                محفظة نسك
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-bold ${
                      wallet.walletBalance > 0
                        ? "text-status-success-foreground"
                        : wallet.walletBalance === 0
                          ? "text-muted-foreground"
                          : "text-status-error-foreground"
                    }`}
                    data-testid="nusk-wallet-balance"
                  >
                    {formatCurrency(wallet.walletBalance)}
                  </span>
                  <span className="text-xs text-muted-foreground">ر.س</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {wallet.walletBalance > 0
                    ? "رصيد متاح للشراء"
                    : wallet.walletBalance === 0
                      ? "متطابق — اشحن المحفظة قبل أي فاتورة جديدة"
                      : "العمليات تجاوزت الإيداعات — التزام مستحق لنسك"}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">إجمالي التحويلات لنسك</p>
                  <span className="font-semibold" data-testid="nusk-wallet-deposits">
                    {formatCurrency(wallet.totalDeposits)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">إجمالي فواتير نسك</p>
                  <span className="font-semibold" data-testid="nusk-wallet-obligations">
                    {formatCurrency(wallet.totalObligations)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">إجمالي المرتجعات</p>
                  <span className="font-semibold text-status-info-foreground" data-testid="nusk-wallet-refunds">
                    {formatCurrency(wallet.totalRefunds)}
                  </span>
                </div>
              </div>

              {wallet.walletBalance < 0 && (
                <div className="rounded-md border border-status-error-surface bg-status-error-surface/30 p-3 text-sm text-status-error-foreground flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    التزاماتك تجاوزت تحويلاتك — لا يمكن شراء تأشيرات جديدة قبل تسوية الرصيد. يجب تحويل
                    {" "}<strong>{formatCurrency(Math.abs(wallet.walletBalance))} ر.س</strong> على الأقل إلى مورد نسك.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
