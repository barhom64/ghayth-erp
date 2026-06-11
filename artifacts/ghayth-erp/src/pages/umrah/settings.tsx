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
import { PoliciesTab } from "@/components/umrah/policies-tab";
import { Settings as SettingsIcon, Save, AlertTriangle, Wallet, Package, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  // Overstay-penalty knobs (PR #1477 + this PR). null = use the global
  // default; explicit number = company-scoped override.
  umrahOverstayDailyPenalty: number | null;
  umrahOverstayTierDays: number | null;
  umrahOverstayTierAmount: number | null;
  // §8 of #1870 — finance hygiene knobs from §6 and §5.
  //   umrahVatRate    — standard VAT rate the engine multiplies the margin by.
  //   umrahVatMode    — 'inclusive' extracts VAT from the margin-inclusive
  //                     ground-service line (KSA default per the operator);
  //                     'exclusive' adds VAT on top of the margin (legacy).
  //   commissionViaHr — when true, marketer commission accrual credits
  //                     salary_payable (HR's account) so payroll clears it
  //                     in one shot. When false, keeps the legacy
  //                     commission_payable (separate liability).
  umrahVatRate: number | null;
  umrahVatMode: "inclusive" | "exclusive" | null;
  commissionViaHr: boolean | null;
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
  // Overstay-penalty knobs (PR #1477 + this PR). Stored as strings to
  // preserve the operator's empty-state distinction ("" = use global
  // default; "0" = explicit zero penalty).
  const [penaltyDailyAmount, setPenaltyDailyAmount] = useState<string>("");
  const [penaltyTierDays, setPenaltyTierDays] = useState<string>("");
  const [penaltyTierAmount, setPenaltyTierAmount] = useState<string>("");
  // §8 of #1870 — finance-hygiene knobs.
  const [vatRate, setVatRate] = useState<string>("");
  const [vatMode, setVatMode] = useState<"" | "inclusive" | "exclusive">("");
  // commissionViaHr stays a tri-state ("" = inherit engine default, "true",
  // "false") so the operator's "leave at default" choice survives a reload.
  const [commissionViaHr, setCommissionViaHr] = useState<"" | "true" | "false">("");
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
  useEffect(() => {
    if (settings == null) return;
    setPenaltyDailyAmount(settings.umrahOverstayDailyPenalty != null ? String(settings.umrahOverstayDailyPenalty) : "");
  }, [settings?.umrahOverstayDailyPenalty]);
  useEffect(() => {
    if (settings == null) return;
    setPenaltyTierDays(settings.umrahOverstayTierDays != null ? String(settings.umrahOverstayTierDays) : "");
  }, [settings?.umrahOverstayTierDays]);
  useEffect(() => {
    if (settings == null) return;
    setPenaltyTierAmount(settings.umrahOverstayTierAmount != null ? String(settings.umrahOverstayTierAmount) : "");
  }, [settings?.umrahOverstayTierAmount]);
  useEffect(() => {
    if (settings == null) return;
    setVatRate(settings.umrahVatRate != null ? String(settings.umrahVatRate) : "");
  }, [settings?.umrahVatRate]);
  useEffect(() => {
    if (settings == null) return;
    setVatMode(settings.umrahVatMode ?? "");
  }, [settings?.umrahVatMode]);
  useEffect(() => {
    if (settings == null) return;
    setCommissionViaHr(
      settings.commissionViaHr == null
        ? ""
        : settings.commissionViaHr
        ? "true"
        : "false"
    );
  }, [settings?.commissionViaHr]);

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
          umrahOverstayDailyPenalty: toPatchValue(penaltyDailyAmount),
          umrahOverstayTierDays: toPatchValue(penaltyTierDays),
          umrahOverstayTierAmount: toPatchValue(penaltyTierAmount),
          // §8 — finance-hygiene knobs. "" → null (revert to engine default);
          // explicit value → company-scoped override.
          umrahVatRate: toPatchValue(vatRate),
          umrahVatMode: vatMode === "" ? null : vatMode,
          commissionViaHr: commissionViaHr === "" ? null : commissionViaHr === "true",
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
    selectedTransportProductId !== (settings?.umrahTransportProductId != null ? String(settings.umrahTransportProductId) : "") ||
    penaltyDailyAmount !== (settings?.umrahOverstayDailyPenalty != null ? String(settings.umrahOverstayDailyPenalty) : "") ||
    penaltyTierDays !== (settings?.umrahOverstayTierDays != null ? String(settings.umrahOverstayTierDays) : "") ||
    penaltyTierAmount !== (settings?.umrahOverstayTierAmount != null ? String(settings.umrahOverstayTierAmount) : "") ||
    vatRate !== (settings?.umrahVatRate != null ? String(settings.umrahVatRate) : "") ||
    vatMode !== (settings?.umrahVatMode ?? "") ||
    commissionViaHr !== (
      settings?.commissionViaHr == null ? "" : settings.commissionViaHr ? "true" : "false"
    );

  return (
    <PageShell title="إعدادات العمرة" subtitle="ضبط ربط وحدة العمرة بالنظام المالي" breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/umrah", label: "العمرة" }, { label: "الإعدادات" }]}>
      <UmrahTabsNav />
      <div className="space-y-6 max-w-3xl">
        {/* §8 Phase 2 of #1870 — Policies catalog. The existing
            cards below (NUSK link, product mapping, overstay penalty)
            stay as-is; this section adds the 11 missing categories
            (Season / Visa / Overstay Grace / Violations / Import /
            Auto-link / Pricing / Commission / Financial / Calendar /
            Notifications) all wired to /umrah/settings/policies. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              سياسات العمرة (11 فئة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PoliciesTab />
          </CardContent>
        </Card>
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

        {/* Overstay-penalty knobs (PR #1477 + #1479). Lets the
            operator switch between the per-day and the tiered
            penalty models without opening a DB console. The
            tiered model takes effect when BOTH tier_days AND
            tier_amount are > 0 — the cron picks the right formula
            from the values it reads here. */}
        <Card data-testid="umrah-overstay-penalty-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              نموذج غرامة التأخّر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              يحدّد كيف يحسب المحرّك غرامة المعتمر المتأخّر بعد انتهاء برنامج العمرة. اترك جميع الحقول
              فارغة لاستخدام القيمة الافتراضية على مستوى النظام، أو اضبط رقماً لتجاوزها على هذه الشركة.
            </p>

            {Number(penaltyTierDays) > 0 && Number(penaltyTierAmount) > 0 ? (
              <div
                className="rounded-md border border-status-info-surface bg-status-info-surface/30 p-3 text-sm text-status-info-foreground"
                data-testid="penalty-tiered-active-banner"
              >
                النموذج النشط حالياً:
                <strong className="mx-1">متدرّج</strong>
                — كل {penaltyTierDays} يوم تأخّر = {penaltyTierAmount} ر.س على الوكيل.
              </div>
            ) : Number(penaltyDailyAmount) > 0 ? (
              <div
                className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground"
                data-testid="penalty-per-day-active-banner"
              >
                النموذج النشط حالياً:
                <strong className="mx-1">يومي</strong>
                — {penaltyDailyAmount} ر.س لكل يوم تأخّر.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2" data-testid="penalty-tier-days-field">
                <Label htmlFor="penalty-tier-days">عدد أيام الشريحة</Label>
                <Input
                  id="penalty-tier-days"
                  type="number"
                  min="0"
                  step="1"
                  value={penaltyTierDays}
                  onChange={(e) => setPenaltyTierDays(e.target.value)}
                  placeholder="مثلاً 10"
                />
                <p className="text-xs text-muted-foreground">
                  كل كم يوم تأخّر = شريحة غرامة واحدة؟
                </p>
              </div>

              <div className="space-y-2" data-testid="penalty-tier-amount-field">
                <Label htmlFor="penalty-tier-amount">قيمة الشريحة (ر.س)</Label>
                <Input
                  id="penalty-tier-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={penaltyTierAmount}
                  onChange={(e) => setPenaltyTierAmount(e.target.value)}
                  placeholder="مثلاً 50"
                />
                <p className="text-xs text-muted-foreground">
                  المبلغ المضاف على الوكيل لكل شريحة.
                </p>
              </div>

              <div className="space-y-2" data-testid="penalty-daily-amount-field">
                <Label htmlFor="penalty-daily-amount">الغرامة اليومية (ر.س)</Label>
                <Input
                  id="penalty-daily-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={penaltyDailyAmount}
                  onChange={(e) => setPenaltyDailyAmount(e.target.value)}
                  placeholder="مثلاً 5"
                />
                <p className="text-xs text-muted-foreground">
                  يُستخدم فقط عندما لا تكون قيم الشريحتَين معاً مضبوطة.
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              مثال على النموذج المتدرّج (10 / 50): تأخّر 5 أيام = 50 ر.س، 15 يوماً = 100 ر.س، 21 يوماً = 150 ر.س.
            </p>
          </CardContent>
        </Card>

        {/* §8 of #1870 — finance hygiene knobs (VAT direction + commission
            routing). Both ship with safe defaults that match the operator's
            stated rules (inclusive VAT extraction; commission via HR). The
            empty/"" state means "inherit engine default" so the operator
            can revert without remembering the actual default value. */}
        <Card data-testid="umrah-finance-hygiene-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              ضريبة القيمة المضافة + توجيه العمولة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2" data-testid="umrah-vat-rate-input">
              <Label htmlFor="umrah-vat-rate">نسبة ضريبة القيمة المضافة (%)</Label>
              <Input
                id="umrah-vat-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                placeholder="افتراضي 15"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                القاعدة المضروبة بالنسبة = الهامش = البيع − التكلفة (وليست المبيعات الإجمالية).
              </p>
            </div>

            <div className="space-y-2" data-testid="umrah-vat-mode-select">
              <Label htmlFor="umrah-vat-mode">اتجاه الضريبة</Label>
              <select
                id="umrah-vat-mode"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={vatMode}
                onChange={(e) => setVatMode(e.target.value as "" | "inclusive" | "exclusive")}
              >
                <option value="">— استخدام الافتراضي (شامل) —</option>
                <option value="inclusive">شامل — الضريبة مستخرَجة من الهامش (× 15/115)</option>
                <option value="exclusive">حصري — الضريبة تُضاف فوق الهامش (× 15/100)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                <strong>«شامل»</strong> هو نظام هامش وكلاء السفر السعودي — السعر المعروض على العميل لا يتغيّر عند تغيّر النسبة.
              </p>
            </div>

            <div className="space-y-2" data-testid="commission-via-hr-select">
              <Label htmlFor="commission-via-hr">توجيه استحقاق العمولة</Label>
              <select
                id="commission-via-hr"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={commissionViaHr}
                onChange={(e) => setCommissionViaHr(e.target.value as "" | "true" | "false")}
              >
                <option value="">— استخدام الافتراضي (عبر HR) —</option>
                <option value="true">عبر HR — استحقاق العمولة يدخل دفتر الرواتب (دائن واحد للموظف)</option>
                <option value="false">منفصل (قديم) — حساب مستقلّ لعمولات مستحقة</option>
              </select>
              <p className="text-xs text-muted-foreground">
                «عبر HR» يوحّد «راتب مستحق» + «عمولة مستحقة» في حساب واحد فتُسوّى دفعة واحدة عند مسير الرواتب.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <GuardedButton
                perm="umrah:update"
                onClick={save}
                disabled={!dirty || saving}
                data-testid="umrah-finance-hygiene-save"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "جاري الحفظ..." : "حفظ"}
              </GuardedButton>
            </div>
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

        <UmrahNotificationsCard />
      </div>
    </PageShell>
  );
}

// ─── Notifications card — in-app alerts via the platform seam ─────
//
// Cron handlers call `createNotification` which writes to the
// `notifications` table — the same one the bell icon reads. No
// external provider, no per-message cost, audit trail by default.

const NOTIFY_KEYS = [
  {
    key: "umrah.notify.visa_expiry",
    label: "تنبيه انتهاء التأشيرة",
    description: "إشعار للمدير قبل ٧ أيام من انتهاء تأشيرة معتمر. يحترم استبعاد دول الخليج تلقائيًا.",
  },
  {
    key: "umrah.notify.departure_reminder",
    label: "تذكير وصول معتمر غدًا",
    description: "إشعار للمدير مساء كل يوم للمعتمرين الذين رحلتهم غدًا — لتأمين النقل ونقطة الاستلام.",
  },
  {
    key: "umrah.notify.overstay_warning",
    label: "تنبيه تجاوز مدة الإقامة",
    description: "إشعار يومي للمدير عن كل معتمر تجاوز موعد المغادرة (لا تُرسَل للمعفيين).",
  },
  {
    key: "umrah.auto_penalty.enabled",
    label: "تشغيل تلقائي لمحرك الغرامات",
    description: "ينشئ غرامة التجاوز تلقائيًا الساعة ٧ صباحًا. يحترم المعتمرين المعفيين.",
  },
] as const;

function UmrahNotificationsCard() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);

  // Initial load — one resolve call per key. Settings layer is fast +
  // we render the card in a section that's already scrolled into view.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, boolean> = {};
      for (const k of NOTIFY_KEYS) {
        try {
          const res = await apiFetch<{ value: unknown }>(
            `/settings/resolve?key=${encodeURIComponent(k.key)}`,
          );
          out[k.key] = res.value === true || res.value === "true" || res.value === 1;
        } catch {
          out[k.key] = false;
        }
      }
      if (!cancelled) {
        setFlags(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = async (key: string, next: boolean) => {
    setSaving(key);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value: next }),
      });
      setFlags((prev) => ({ ...prev, [key]: next }));
      toast({ title: next ? "تم التفعيل" : "تم الإيقاف" });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: e?.message ?? "تعذّر تحديث الإعداد",
      });
    } finally {
      setSaving(null);
    }
  };

  const sendTest = async () => {
    setTestSending(true);
    try {
      await apiFetch("/umrah/notifications/test", { method: "POST" });
      toast({
        title: "أُرسل إشعار تجريبي",
        description: "افتح رمز الجرس أعلى الصفحة — يجب أن ترى الإشعار خلال ثوانٍ.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الاختبار",
        description: e?.message ?? "تعذّر إرسال الإشعار",
      });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <Card data-testid="umrah-notifications-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          إشعارات تلقائية للمدير + المحركات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          الإشعارات تظهر في رمز الجرس أعلى الصفحة (نفس النظام الذي يستخدمه باقي الـERP). لا تحتاج
          ضبط أي مزوّد خارجي.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : (
          <div className="space-y-3">
            {NOTIFY_KEYS.map((k) => (
              <div
                key={k.key}
                className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0"
                data-testid={`notify-row-${k.key}`}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {k.description}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={flags[k.key] ?? false}
                    disabled={saving === k.key}
                    onChange={(e) => toggle(k.key, e.target.checked)}
                    className="h-4 w-4"
                    data-testid={`notify-toggle-${k.key}`}
                  />
                  <span className="text-xs">
                    {flags[k.key] ? "مفعّل" : "متوقف"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            اضغط الزر لإرسال إشعار تجريبي لحسابك — يتأكد من ضبط الـemployee_assignment
            وأن الجرس يستقبل.
          </div>
          <GuardedButton
            perm="umrah:create"
            onClick={sendTest}
            disabled={testSending}
            size="sm"
            data-testid="notify-test-send"
          >
            {testSending ? "جاري..." : "إرسال إشعار تجريبي"}
          </GuardedButton>
        </div>
      </CardContent>
    </Card>
  );
}
