import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, CheckCircle, AlertTriangle, Info, CheckCheck, BellRing, Save } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

type InfraAlert = {
  id: number;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
  companyId: number;
  companyName: string | null;
};

type InfraAlertsResponse = {
  data: InfraAlert[];
  total: number;
  open: number;
  openCritical: number;
};

type SeverityThreshold = "info" | "warning" | "critical";

type InfraDigestConfig = {
  severityThreshold: SeverityThreshold;
  cooldownMinutes: number;
};

type InfraDigestCompany = {
  id: number;
  name: string;
  hasOverride: boolean;
  // Only present for overriding companies (Task #861) — the company's own
  // threshold/cooldown so admins can spot outliers at a glance.
  config?: InfraDigestConfig;
};

type InfraDigestSettingsResponse = {
  companyId: number;
  companies: InfraDigestCompany[];
  config: InfraDigestConfig;
  systemConfig: InfraDigestConfig;
  hasCompanyOverride: boolean;
  defaults: InfraDigestConfig;
  limits: { minCooldownMinutes: number; maxCooldownMinutes: number };
};

const THRESHOLD_OPTIONS: { value: SeverityThreshold; label: string }[] = [
  { value: "critical", label: "حرج فقط (الافتراضي)" },
  { value: "warning", label: "تحذير فأعلى (تحذير + حرج)" },
  { value: "info", label: "الكل (معلومة + تحذير + حرج)" },
];

const SEVERITY_META: Record<string, { label: string; className: string; icon: typeof Info }> = {
  critical: { label: "حرج", className: "bg-status-error-surface text-status-error-foreground", icon: ShieldAlert },
  warning: { label: "تحذير", className: "bg-status-warning-surface text-status-warning-foreground", icon: AlertTriangle },
  info: { label: "معلومة", className: "bg-status-info-surface text-status-info-foreground", icon: Info },
};

export default function AdminInfraAlerts() {
  const { toast } = useToast();
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<{ type?: string } | null>(null);

  const state = showAcknowledged ? "acknowledged" : "open";
  const { data, isLoading, error, refetch } = useApiQuery<InfraAlertsResponse>(
    ["infra-alerts", state],
    `/intelligence/alerts/infra?state=${state}`,
  );

  const rows = data?.data ?? [];
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.title, r.type, r.companyName].some((f) => String(f ?? "").toLowerCase().includes(term)),
    );
  }, [rows, q]);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);
  const openTotal = data?.open ?? 0;
  const openCritical = data?.openCritical ?? 0;

  // Group the currently-loaded open alerts by type so an admin can acknowledge a
  // whole wave of the same incident at once (e.g. one system_health type per company).
  const typeSummary = useMemo(() => {
    if (showAcknowledged) return [];
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([type, cnt]) => ({ type, cnt }))
      .sort((a, b) => b.cnt - a.cnt);
  }, [rows, showAcknowledged]);

  // Digest config (Task #834) — which severities page on-call + cooldown length.
  // Per-company tuning (Task #851): an admin picks which company they manage and
  // edits that company's override (or resets it to inherit the system default).
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const {
    data: settings,
    isLoading: settingsLoading,
    refetch: refetchSettings,
  } = useApiQuery<InfraDigestSettingsResponse>(
    ["infra-digest-settings", String(selectedCompanyId ?? "self")],
    `/intelligence/alerts/infra/settings${selectedCompanyId != null ? `?companyId=${selectedCompanyId}` : ""}`,
  );
  const [threshold, setThreshold] = useState<SeverityThreshold>("critical");
  const [cooldown, setCooldown] = useState<string>("30");
  const [savingSettings, setSavingSettings] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (settings?.config) {
      setThreshold(settings.config.severityThreshold);
      setCooldown(String(settings.config.cooldownMinutes));
    }
    // Latch onto the server-resolved company on first load so the picker
    // reflects which company is being edited.
    if (selectedCompanyId == null && settings?.companyId != null) {
      setSelectedCompanyId(settings.companyId);
    }
  }, [settings, selectedCompanyId]);

  const companies = settings?.companies ?? [];
  const activeCompanyId = selectedCompanyId ?? settings?.companyId ?? null;

  const minCooldown = settings?.limits.minCooldownMinutes ?? 1;
  const maxCooldown = settings?.limits.maxCooldownMinutes ?? 1440;
  const cooldownNum = Number(cooldown);
  const cooldownValid = Number.isInteger(cooldownNum) && cooldownNum >= minCooldown && cooldownNum <= maxCooldown;
  const hasOverride = settings?.hasCompanyOverride ?? false;
  const systemConfig = settings?.systemConfig;
  const settingsDirty = !!settings?.config && (
    threshold !== settings.config.severityThreshold || cooldownNum !== settings.config.cooldownMinutes
  );
  const systemThresholdLabel = systemConfig
    ? THRESHOLD_OPTIONS.find((o) => o.value === systemConfig.severityThreshold)?.label ?? systemConfig.severityThreshold
    : "";

  // Override-impact overview (Task #861): show how many companies deviate from
  // the system default vs. inherit it, plus each outlier's own threshold/cooldown
  // so an admin editing the system default can see who it actually affects.
  const overridingCompanies = useMemo(
    () => companies.filter((c) => c.hasOverride),
    [companies],
  );
  const inheritingCount = companies.length - overridingCompanies.length;

  async function saveSettings() {
    if (!cooldownValid) return;
    setSavingSettings(true);
    try {
      // Saved as the selected company's own override (falls back to the system
      // default when reset). Backend defaults scope to "company".
      await apiFetch(`/intelligence/alerts/infra/settings`, {
        method: "PUT",
        body: JSON.stringify({
          severityThreshold: threshold,
          cooldownMinutes: cooldownNum,
          scope: "company",
          ...(activeCompanyId != null ? { companyId: activeCompanyId } : {}),
        }),
      });
      toast({ title: "تم حفظ إعدادات التنبيه للشركة" });
      refetchSettings();
    } catch (e: any) {
      toast({ title: "تعذّر حفظ الإعدادات", description: e?.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  async function resetToSystemDefault() {
    setResetting(true);
    try {
      await apiFetch(
        `/intelligence/alerts/infra/settings${activeCompanyId != null ? `?companyId=${activeCompanyId}` : ""}`,
        { method: "DELETE" },
      );
      toast({ title: "تمت إعادة الإعداد إلى الافتراضي للنظام" });
      refetchSettings();
    } catch (e: any) {
      toast({ title: "تعذّر إعادة التعيين", description: e?.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  async function acknowledge(id: number) {
    setBusy(true);
    try {
      await apiFetch(`/intelligence/alerts/${id}/dismiss`, { method: "PATCH" });
      toast({ title: "تم اعتماد التنبيه" });
      refetch();
    } catch (e: any) {
      toast({ title: "تعذّر اعتماد التنبيه", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeBulk(type?: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ dismissed: number; message: string }>(
        `/intelligence/alerts/infra/dismiss-bulk`,
        { method: "POST", body: JSON.stringify(type ? { type } : {}) },
      );
      toast({ title: r.message ?? `تم اعتماد ${r.dismissed} تنبيه` });
      refetch();
    } catch (e: any) {
      toast({ title: "تعذّر الاعتماد الجماعي", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmBulk(null);
    }
  }

  const columns: DataTableColumn<InfraAlert>[] = useMemo(() => [
    {
      key: "severity", header: "الخطورة", render: (r) => {
        const meta = SEVERITY_META[r.severity] ?? SEVERITY_META.info;
        const Icon = meta.icon;
        return (
          <Badge className={`${meta.className} gap-1`}>
            <Icon className="h-3 w-3" />{meta.label}
          </Badge>
        );
      },
    },
    { key: "title", header: "التنبيه", searchable: true, render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-sm truncate max-w-[360px]" title={r.title}>{r.title}</p>
        {r.description && (
          <p className="text-[11px] text-muted-foreground truncate max-w-[360px]" title={r.description}>{r.description}</p>
        )}
      </div>
    )},
    { key: "type", header: "النوع", searchable: true, render: (r) => <span className="font-mono text-xs">{r.type}</span> },
    { key: "companyName", header: "الشركة", render: (r) => <span className="text-xs">{r.companyName || `#${r.companyId}`}</span> },
    { key: "createdAt", header: "الوقت", sortable: true, render: (r) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
    { key: "isDismissed", header: "الحالة", render: (r) => r.isDismissed ? (
      <Badge className="bg-status-success-surface text-status-success-foreground">معتمد</Badge>
    ) : (
      <Badge className="bg-status-error-surface text-status-error-foreground">مفتوح</Badge>
    )},
    { key: "actions", header: "إجراء", hidden: showAcknowledged, render: (r) => (
      <GuardedButton perm={["admin:update"]} variant="outline" size="sm" disabled={busy} onClick={() => acknowledge(r.id)}>
        <CheckCircle className="h-4 w-4 me-1" />اعتماد
      </GuardedButton>
    )},
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [showAcknowledged, busy]);

  return (
    <PageShell
      title="تنبيهات البنية التحتية"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "تنبيهات البنية التحتية" },
      ]}
      subtitle="تنبيهات صحة المنصّة (حدود المعدّل، تراكم الأحداث المؤجّلة، فشل تسجيل أثر الإشعارات) في مكان واحد"
      loading={isLoading}
      actions={
        <div className="flex gap-2">
          <PrintButton
            entityType="report_admin_infra_alerts"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تنبيهات البنية التحتية", total: printRows.length },
              items: printRows.map((r: any) => ({
                "الخطورة": (SEVERITY_META[r.severity] ?? SEVERITY_META.info).label,
                "التنبيه": r.title,
                "النوع": r.type,
                "الشركة": r.companyName || `#${r.companyId}`,
                "الوقت": r.createdAt,
                "الحالة": r.isDismissed ? "معتمد" : "مفتوح",
              })),
            })}
          />
          {!showAcknowledged && openTotal > 0 && (
            <GuardedButton perm={["admin:update"]} size="sm" disabled={busy} onClick={() => setConfirmBulk({})}>
              <CheckCheck className="h-4 w-4 me-1" />اعتماد الكل
            </GuardedButton>
          )}
          <Button variant={showAcknowledged ? "default" : "outline"} size="sm" onClick={() => setShowAcknowledged(!showAcknowledged)}>
            {showAcknowledged ? "المعتمدة" : "المفتوحة"}
          </Button>
          <RefreshAction onRefresh={() => refetch()} />
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className={openTotal > 0 ? "bg-status-error-surface" : "bg-status-success-surface"}>
              <CardContent className="p-4 flex items-center gap-3">
                {openTotal > 0 ? (
                  <ShieldAlert className="w-8 h-8 text-status-error-foreground" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-status-success-foreground" />
                )}
                <div>
                  <p className="text-2xl font-bold">{openTotal}</p>
                  <p className="text-xs text-muted-foreground">تنبيهات مفتوحة</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className={`w-8 h-8 ${openCritical > 0 ? "text-status-error-foreground" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-2xl font-bold">{openCritical}</p>
                  <p className="text-xs text-muted-foreground">منها حرجة</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {!showAcknowledged && typeSummary.length > 1 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCheck className="w-4 h-4" />
                  اعتماد جماعي حسب النوع
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  أثناء الحادثة يُطلق السبب الجذري نفسه عدة تنبيهات (واحدًا لكل شركة). اعتمد موجة كاملة من النوع نفسه دفعة واحدة.
                </p>
                <div className="space-y-2">
                  {typeSummary.map((s) => (
                    <div key={s.type} className="flex items-center justify-between gap-3 rounded-md border p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs truncate">{s.type}</span>
                        <Badge variant="outline">{s.cnt}</Badge>
                      </div>
                      <GuardedButton
                        perm={["admin:update"]}
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmBulk({ type: s.type })}
                      >
                        اعتماد النوع
                      </GuardedButton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4" />
                إعدادات تنبيه المناوبين
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                تحكّم في خطورة التنبيهات التي تُرسل تنبيهًا للمناوبين، ومدة التهدئة بين التنبيهات المتتالية لهذه الشركة. الافتراضي: حرج فقط، كل ٣٠ دقيقة.
              </p>
            </CardHeader>
            <CardContent>
              {companies.length > 1 && (
                <div className="mb-4 max-w-2xl space-y-1.5">
                  <Label htmlFor="infra-company">الشركة</Label>
                  <Select
                    value={activeCompanyId != null ? String(activeCompanyId) : ""}
                    onValueChange={(v) => setSelectedCompanyId(Number(v))}
                    disabled={settingsLoading}
                  >
                    <SelectTrigger id="infra-company"><SelectValue placeholder="اختر الشركة" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}{c.hasOverride ? " — إعداد خاص" : " — افتراضي النظام"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    اختر شركة لضبط حساسية تنبيهاتها. الشركات ذات «إعداد خاص» تتجاوز الإعداد الافتراضي للنظام.
                  </p>
                </div>
              )}
              {!settingsLoading && companies.length > 1 && (
                <div className="mb-4 rounded-md border bg-muted/40 p-3 max-w-2xl">
                  <p className="text-xs font-medium mb-2 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" />
                    أثر تعديل الإعداد الافتراضي للنظام
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {inheritingCount} شركة تتبع الافتراضي
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      {overridingCompanies.length} شركة بإعداد خاص
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    تعديل الإعداد الافتراضي للنظام يؤثر على الشركات التي تتبعه فقط؛ الشركات ذات الإعداد الخاص لا تتأثر.
                  </p>
                  {overridingCompanies.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">الشركات ذات الإعداد الخاص:</p>
                      {overridingCompanies.map((c) => {
                        const cfg = c.config;
                        const label = cfg
                          ? THRESHOLD_OPTIONS.find((o) => o.value === cfg.severityThreshold)?.label ?? cfg.severityThreshold
                          : null;
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border bg-background px-2 py-1.5 text-[11px]">
                            <span className="truncate font-medium" title={c.name}>{c.name}</span>
                            {cfg ? (
                              <span className="text-muted-foreground whitespace-nowrap">{label} · كل {cfg.cooldownMinutes} دقيقة</span>
                            ) : (
                              <span className="text-muted-foreground">إعداد خاص</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {!settingsLoading && systemConfig && (
                <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground max-w-2xl">
                  {hasOverride ? (
                    <span>هذه الشركة تستخدم إعدادًا خاصًا بها. الإعداد الافتراضي للنظام: {systemThresholdLabel} كل {systemConfig.cooldownMinutes} دقيقة.</span>
                  ) : (
                    <span>هذه الشركة تستخدم الإعداد الافتراضي للنظام: {systemThresholdLabel} كل {systemConfig.cooldownMinutes} دقيقة. الحفظ سيُنشئ إعدادًا خاصًا بالشركة.</span>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1.5">
                  <Label htmlFor="infra-threshold">حدّ الخطورة المُنبِّه</Label>
                  <Select value={threshold} onValueChange={(v) => setThreshold(v as SeverityThreshold)} disabled={settingsLoading}>
                    <SelectTrigger id="infra-threshold"><SelectValue placeholder="اختر الحدّ" /></SelectTrigger>
                    <SelectContent>
                      {THRESHOLD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="infra-cooldown">مدة التهدئة (بالدقائق)</Label>
                  <Input
                    id="infra-cooldown"
                    type="number"
                    inputMode="numeric"
                    min={minCooldown}
                    max={maxCooldown}
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                    disabled={settingsLoading}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    من {minCooldown} إلى {maxCooldown} دقيقة. تمنع تكرار التنبيه خلال هذه المدة.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <GuardedButton
                  perm={["admin:update"]}
                  size="sm"
                  disabled={savingSettings || settingsLoading || !settingsDirty || !cooldownValid}
                  onClick={saveSettings}
                >
                  <Save className="h-4 w-4 me-1" />حفظ الإعدادات
                </GuardedButton>
                {hasOverride && (
                  <GuardedButton
                    perm={["admin:update"]}
                    size="sm"
                    variant="outline"
                    disabled={resetting || savingSettings || settingsLoading}
                    onClick={resetToSystemDefault}
                  >
                    إعادة إلى الافتراضي للنظام
                  </GuardedButton>
                )}
                {!cooldownValid && (
                  <span className="text-xs text-status-error-foreground">
                    أدخل عددًا صحيحًا بين {minCooldown} و{maxCooldown}.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="max-w-sm">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="بحث بالتنبيه أو النوع أو الشركة…"
                />
              </div>
              <DataTable
                columns={columns}
                data={filtered}
                onSortedDataChange={setPrintRows}
                noToolbar
                pageSize={0}
                emptyMessage={showAcknowledged ? "لا توجد تنبيهات معتمدة" : "لا توجد تنبيهات بنية تحتية مفتوحة — المنصّة تعمل بشكل طبيعي"}
              />
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>

      <AlertDialog open={confirmBulk !== null} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الاعتماد الجماعي</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulk?.type
                ? `سيتم اعتماد كل تنبيهات النوع "${confirmBulk.type}" المفتوحة.`
                : `سيتم اعتماد كل تنبيهات البنية التحتية المفتوحة.`}
              {" "}متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => acknowledgeBulk(confirmBulk?.type)}>تأكيد الاعتماد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
