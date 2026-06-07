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
    penaltyTierAmount !== (settings?.umrahOverstayTierAmount != null ? String(settings.umrahOverstayTierAmount) : "");

  return (
    <PageShell title="إعدادات العمرة" subtitle="ضبط ربط وحدة العمرة بالنظام المالي" breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/umrah", label: "العمرة" }, { label: "الإعدادات" }]}>
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

// ─── Notifications card — opt-in SMS triggers + Twilio config link ────
//
// The SMS infrastructure is already wired: the queue worker
// (`processSmsQueue` in cronScheduler.ts) reads Twilio credentials
// from `system_settings` and delivers. This card adds the umrah-side
// switches that tell the cron handlers WHICH notifications to send +
// links the operator to the Twilio settings page if they haven't
// configured the channel yet.

const NOTIFY_KEYS = [
  {
    key: "umrah.notify.visa_expiry",
    label: "تنبيه انتهاء التأشيرة",
    description: "SMS للمعتمر قبل ٧ أيام من انتهاء تأشيرته. يحترم استبعاد دول الخليج تلقائيًا.",
  },
  {
    key: "umrah.notify.departure_reminder",
    label: "تذكير الرحيل غدًا",
    description: "SMS مساء كل يوم للمعتمرين الذين رحلتهم غدًا (يحتاج رقم هاتف في السجل).",
  },
  {
    key: "umrah.notify.overstay_warning",
    label: "تنبيه تجاوز مدة الإقامة",
    description: "SMS يومي للمعتمر بعد تجاوز موعد المغادرة، حتى يتواصل مع وكيله.",
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
  const [testPhone, setTestPhone] = useState("");
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
    const phone = testPhone.trim();
    if (!phone) {
      toast({ variant: "destructive", title: "أدخل رقم الهاتف للاختبار" });
      return;
    }
    setTestSending(true);
    try {
      await apiFetch("/umrah/notifications/test-sms", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      toast({
        title: "أُرسل الطلب إلى قائمة الانتظار",
        description: "إذا كان provider مضبوطًا، ستصل الرسالة خلال دقيقة.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الاختبار",
        description: e?.message ?? "تعذّر إرسال الرسالة",
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
          تنبيهات تلقائية للمعتمرين (SMS) + المحركات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          الـSMS يمرّ عبر قناة الإرسال المضبوطة في{" "}
          <a
            href="/settings/communication-channels"
            className="underline text-status-info-foreground"
          >
            إعدادات قنوات الاتصال
          </a>
          . لا حاجة لتفعيل أي خيار هنا حتى تضبط الـprovider هناك أولًا.
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

        <div className="pt-3 border-t space-y-2">
          <Label className="text-sm">اختبار SMS — أدخل رقمك للتجربة</Label>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+9665xxxxxxxx"
              dir="ltr"
              className="text-sm"
              data-testid="notify-test-phone"
            />
            <GuardedButton
              perm="umrah:create"
              onClick={sendTest}
              disabled={testSending || !testPhone.trim()}
              size="sm"
              data-testid="notify-test-send"
            >
              {testSending ? "جارٍ..." : "إرسال اختبار"}
            </GuardedButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
