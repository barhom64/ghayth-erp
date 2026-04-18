import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, Play, Settings2, Clock, Ban, DoorOpen, MapPin,
  AlertTriangle, CheckCircle, FileText, TrendingUp, Loader2,
  RefreshCw, Shield, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// الأنواع
// ─────────────────────────────────────────────────────────────────────────────

interface AutoDetectionSettings {
  enableLateDetection: boolean;
  enableEarlyLeaveDetection: boolean;
  enableAbsenceDetection: boolean;
  enableGpsDetection: boolean;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  gpsRadiusMeters: number;
  autoCreateMemo: boolean;
  notifyEmployee: boolean;
  notifyManager: boolean;
}

interface DetectionLogEntry {
  id: number;
  companyId: number;
  targetDate: string;
  detected: number;
  violationsCreated: number;
  memosCreated: number;
  skipped: number;
  errors: number;
  details: Array<{
    type: string;
    employeeName: string;
    description: string;
    violationId: number | null;
    memoCreated: boolean;
  }>;
  createdAt: string;
}

interface DetectionSummary {
  totalRuns: number;
  totalDetected: number;
  totalViolations: number;
  totalMemos: number;
  totalErrors: number;
  lastRunAt: string | null;
  byType: Array<{ type: string; label: string; count: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// أوصاف عربية
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, { label: string; Icon: typeof Clock; color: string }> = {
  late:             { label: "تأخر",             Icon: Clock,    color: "text-amber-600 bg-amber-50" },
  early_leave:      { label: "مغادرة مبكرة",     Icon: DoorOpen, color: "text-orange-600 bg-orange-50" },
  absence:          { label: "غياب",             Icon: Ban,      color: "text-red-600 bg-red-50" },
  gps_out_of_range: { label: "خروج عن النطاق",  Icon: MapPin,   color: "text-purple-600 bg-purple-50" },
};

// ─────────────────────────────────────────────────────────────────────────────
// الصفحة
// ─────────────────────────────────────────────────────────────────────────────

export default function AutoDetectionPage() {
  const { toast } = useToast();
  const [showSettings, setShowSettings] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  // ── البيانات ──
  const settingsQuery = useApiQuery<AutoDetectionSettings>(
    ["auto-detection-settings"],
    "/hr/discipline/auto-detection/settings",
  );
  const summaryQuery = useApiQuery<DetectionSummary>(
    ["auto-detection-summary"],
    "/hr/discipline/auto-detection/summary",
  );
  const logQuery = useApiQuery<{ data: DetectionLogEntry[]; total: number }>(
    ["auto-detection-log"],
    "/hr/discipline/auto-detection/log?limit=50",
  );

  const isLoading = settingsQuery.isLoading || summaryQuery.isLoading || logQuery.isLoading;
  const isError = settingsQuery.isError || summaryQuery.isError || logQuery.isError;

  // ── التشغيل اليدوي ──
  const runMutation = useApiMutation<any, { date?: string }>(
    "/hr/discipline/auto-detection/run",
    "POST",
    [["auto-detection-log"], ["auto-detection-summary"]],
    { successMessage: "تم تشغيل الرصد التلقائي بنجاح" },
  );

  // ── حفظ الإعدادات ──
  const saveMutation = useApiMutation<any, Partial<AutoDetectionSettings>>(
    "/hr/discipline/auto-detection/settings",
    "PUT",
    [["auto-detection-settings"]],
    { successMessage: "تم حفظ الإعدادات" },
  );

  const settings = settingsQuery.data;
  const summary = summaryQuery.data;
  const logs = logQuery.data?.data ?? [];

  // ── مؤشرات الأداء ──
  const kpis = [
    {
      label: "إجمالي الوقائع المرصودة",
      value: summary?.totalDetected ?? 0,
      icon: Radar,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "المحاضر المُنشأة تلقائياً",
      value: summary?.totalMemos ?? 0,
      icon: FileText,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "عمليات التشغيل",
      value: summary?.totalRuns ?? 0,
      icon: Activity,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "الأخطاء",
      value: summary?.totalErrors ?? 0,
      icon: AlertTriangle,
      color: summary?.totalErrors ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-50",
    },
  ];

  // ── أعمدة جدول السجل ──
  const columns: DataTableColumn<DetectionLogEntry>[] = [
    {
      key: "targetDate",
      header: "التاريخ",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">
          {new Date(row.targetDate).toLocaleDateString("ar-SA", {
            year: "numeric", month: "short", day: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "detected",
      header: "المكتشفة",
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className={cn(
          "text-xs",
          row.detected > 0 ? "border-amber-300 text-amber-700 bg-amber-50" : "border-gray-200"
        )}>
          {row.detected} واقعة
        </Badge>
      ),
    },
    {
      key: "violationsCreated",
      header: "المخالفات",
      sortable: true,
      render: (row) => (
        <span className={cn("text-sm font-semibold", row.violationsCreated > 0 ? "text-red-600" : "text-gray-400")}>
          {row.violationsCreated}
        </span>
      ),
    },
    {
      key: "memosCreated",
      header: "المحاضر",
      sortable: true,
      render: (row) => (
        <span className={cn("text-sm font-semibold", row.memosCreated > 0 ? "text-blue-600" : "text-gray-400")}>
          {row.memosCreated}
        </span>
      ),
    },
    {
      key: "errors",
      header: "الأخطاء",
      sortable: true,
      render: (row) => (
        <span className={cn("text-sm", row.errors > 0 ? "text-red-600 font-semibold" : "text-gray-400")}>
          {row.errors}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "وقت التشغيل",
      sortable: true,
      render: (row) => (
        <span className="text-xs text-gray-500">
          {new Date(row.createdAt).toLocaleString("ar-SA", {
            hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
          })}
        </span>
      ),
    },
    {
      key: "id",
      header: "التفاصيل",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setExpandedLog(expandedLog === row.id ? null : row.id)}
          disabled={!row.details?.length}
        >
          {row.details?.length ? `${row.details.length} تفاصيل` : "—"}
        </Button>
      ),
    },
  ];

  const handleRun = () => {
    runMutation.mutate({});
  };

  const handleToggleSetting = (key: keyof AutoDetectionSettings, value: boolean) => {
    saveMutation.mutate({ [key]: value });
  };

  const handleNumberSetting = (key: keyof AutoDetectionSettings, value: number) => {
    saveMutation.mutate({ [key]: value });
  };

  return (
    <PageShell
      title="الرصد التلقائي للمخالفات"
      subtitle="محرك المراقبة الآلي — يفحص الحضور يومياً ويُصدر المخالفات والمحاضر تلقائياً"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-4 w-4" />
            الإعدادات
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleRun}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            تشغيل الرصد الآن
          </Button>
        </div>
      }
    >
      {/* مؤشرات الأداء */}
      <KpiGrid items={kpis} />

      {/* توزيع حسب النوع */}
      {summary?.byType && summary.byType.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              توزيع الوقائع المرصودة (آخر 30 يوم)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summary.byType.map((item) => {
                const meta = TYPE_ICONS[item.type];
                return (
                  <div key={item.type} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    {meta && (
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", meta.color.split(" ")[1])}>
                        <meta.Icon className={cn("h-4 w-4", meta.color.split(" ")[0])} />
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-bold">{item.count}</p>
                      <p className="text-xs text-gray-500">{item.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* نتيجة التشغيل اليدوي */}
      {runMutation.data && (
        <Card className={cn(
          "border shadow-sm",
          runMutation.data.detected > 0 ? "border-amber-200 bg-amber-50/50" : "border-green-200 bg-green-50/50"
        )}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {runMutation.data.detected > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {runMutation.data.detected > 0
                    ? `تم رصد ${runMutation.data.detected} واقعة`
                    : "لا توجد وقائع جديدة"}
                </p>
                {runMutation.data.detected > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600">
                      المخالفات المُنشأة: <strong>{runMutation.data.violationsCreated}</strong> —
                      المحاضر المُنشأة: <strong>{runMutation.data.memosCreated}</strong>
                    </p>
                    {runMutation.data.details?.map((d: any, i: number) => {
                      const meta = TYPE_ICONS[d.type];
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 bg-white/70 rounded">
                          {meta && <meta.Icon className={cn("h-3.5 w-3.5", meta.color.split(" ")[0])} />}
                          <span className="font-medium">{d.employeeName}</span>
                          <span className="text-gray-500">—</span>
                          <span className="text-gray-600">{d.description}</span>
                          {d.memoCreated && (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px] mr-auto">محضر جديد</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* إعدادات الرصد التلقائي */}
      {showSettings && settings && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              إعدادات الرصد التلقائي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* التفعيل/التعطيل */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SettingToggle
                label="رصد التأخر"
                description="رصد تلقائي للموظفين المتأخرين عن بداية الدوام"
                icon={Clock}
                iconColor="text-amber-600"
                checked={settings.enableLateDetection}
                onCheckedChange={(v) => handleToggleSetting("enableLateDetection", v)}
              />
              <SettingToggle
                label="رصد المغادرة المبكرة"
                description="رصد تلقائي للموظفين المغادرين قبل نهاية الدوام"
                icon={DoorOpen}
                iconColor="text-orange-600"
                checked={settings.enableEarlyLeaveDetection}
                onCheckedChange={(v) => handleToggleSetting("enableEarlyLeaveDetection", v)}
              />
              <SettingToggle
                label="رصد الغياب"
                description="رصد تلقائي للموظفين الغائبين بدون إجازة معتمدة"
                icon={Ban}
                iconColor="text-red-600"
                checked={settings.enableAbsenceDetection}
                onCheckedChange={(v) => handleToggleSetting("enableAbsenceDetection", v)}
              />
              <SettingToggle
                label="رصد خروج GPS"
                description="ربط مخالفات الخروج عن النطاق الجغرافي بمحاضر استفسار"
                icon={MapPin}
                iconColor="text-purple-600"
                checked={settings.enableGpsDetection}
                onCheckedChange={(v) => handleToggleSetting("enableGpsDetection", v)}
              />
            </div>

            {/* الحدود */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">الحدود والعتبات</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">حد التأخر (دقائق)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.lateThresholdMinutes}
                    onChange={(e) => handleNumberSetting("lateThresholdMinutes", Number(e.target.value))}
                    className="h-9"
                  />
                  <p className="text-[11px] text-gray-400">لن يُرصد تأخر أقل من هذا الحد</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">حد المغادرة المبكرة (دقائق)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.earlyLeaveThresholdMinutes}
                    onChange={(e) => handleNumberSetting("earlyLeaveThresholdMinutes", Number(e.target.value))}
                    className="h-9"
                  />
                  <p className="text-[11px] text-gray-400">لن تُرصد مغادرة مبكرة أقل من هذا الحد</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">نطاق GPS (متر)</Label>
                  <Input
                    type="number"
                    min={50}
                    max={5000}
                    value={settings.gpsRadiusMeters}
                    onChange={(e) => handleNumberSetting("gpsRadiusMeters", Number(e.target.value))}
                    className="h-9"
                  />
                  <p className="text-[11px] text-gray-400">المسافة القصوى المسموحة من موقع الفرع</p>
                </div>
              </div>
            </div>

            {/* خيارات عامة */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">خيارات عامة</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SettingToggle
                  label="إنشاء محضر تلقائي"
                  description="إنشاء محضر استفسار تلقائياً لكل مخالفة مرصودة"
                  icon={FileText}
                  iconColor="text-blue-600"
                  checked={settings.autoCreateMemo}
                  onCheckedChange={(v) => handleToggleSetting("autoCreateMemo", v)}
                />
                <SettingToggle
                  label="إشعار الموظف"
                  description="إرسال إشعار للموظف عند رصد مخالفة"
                  icon={AlertTriangle}
                  iconColor="text-amber-600"
                  checked={settings.notifyEmployee}
                  onCheckedChange={(v) => handleToggleSetting("notifyEmployee", v)}
                />
                <SettingToggle
                  label="إشعار المدير"
                  description="إرسال إشعار للمدير المباشر عند رصد مخالفة"
                  icon={Shield}
                  iconColor="text-green-600"
                  checked={settings.notifyManager}
                  onCheckedChange={(v) => handleToggleSetting("notifyManager", v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* آخر تشغيل */}
      {summary?.lastRunAt && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>
            آخر تشغيل:{" "}
            {new Date(summary.lastRunAt).toLocaleString("ar-SA", {
              year: "numeric", month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
        </div>
      )}

      {/* جدول السجل */}
      <DataTable
        columns={columns}
        data={logs}
        noToolbar
        emptyMessage="لا توجد عمليات رصد سابقة — شغّل المحرك لبدء المراقبة التلقائية"
        pageSize={20}
      />

      {/* تفاصيل السجل الموسّعة */}
      {expandedLog && (() => {
        const log = logs.find((l) => l.id === expandedLog);
        if (!log?.details?.length) return null;
        return (
          <Card className="border border-blue-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                تفاصيل الرصد —{" "}
                {new Date(log.targetDate).toLocaleDateString("ar-SA", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {log.details.map((d, i) => {
                  const meta = TYPE_ICONS[d.type];
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                      {meta && (
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.color.split(" ")[1])}>
                          <meta.Icon className={cn("h-4 w-4", meta.color.split(" ")[0])} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{d.employeeName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {meta?.label ?? d.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{d.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.memoCreated && (
                          <Badge className="bg-blue-100 text-blue-700 text-[10px]">محضر جديد</Badge>
                        )}
                        {d.violationId && (
                          <Badge variant="outline" className="text-[10px] text-gray-500">
                            #{d.violationId}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// مكون مساعد — مفتاح تبديل الإعداد
// ─────────────────────────────────────────────────────────────────────────────

function SettingToggle({
  label,
  description,
  icon: Icon,
  iconColor,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  icon: typeof Clock;
  iconColor: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
      <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-[11px] text-gray-400 leading-tight">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
