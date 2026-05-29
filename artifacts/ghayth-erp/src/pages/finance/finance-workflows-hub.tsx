import { useState, useMemo } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  Search, ChevronRight, Sparkles, FileSignature, Flame, Calendar,
  TrendingUp, TrendingDown, Layers, Building2, Users, Banknote,
  ScaleIcon, FileCheck2, Receipt, AlertTriangle, FileText, Activity,
  Briefcase, BarChart3, Send, RotateCcw, Grid3x3, Clock, PieChart,
  Target,
} from "lucide-react";

/**
 * Finance Workflows Hub
 *
 * Categorized index of all deep finance workflow pages built in the
 * recent batch. Pure navigation — no API calls — so it loads instantly
 * and helps the user discover features without trawling the sidebar.
 */

interface WorkflowEntry {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isNew?: boolean;
}

interface WorkflowCategory {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  entries: WorkflowEntry[];
}

const CATEGORIES: WorkflowCategory[] = [
  {
    title: "تقارير مالية وقرارات CFO",
    icon: TrendingUp,
    color: "text-status-success-foreground",
    entries: [
      { title: "حزمة الإقفال الشهري", description: "صفحة واحدة قابلة للطباعة لاجتماع مجلس الإدارة", href: "/finance/monthly-close-pack", icon: FileText, isNew: true },
      { title: "CFO Cockpit", description: "لوحة المالية الشاملة", href: "/finance/cfo-cockpit", icon: Sparkles },
      { title: "GL Health Score", description: "تقييم صحة الدفاتر 0-100", href: "/finance/gl-health", icon: Activity },
      { title: "قائمة التدفقات النقدية", description: "IAS 7 — الطريقة المباشرة", href: "/finance/reports/cash-flow-statement", icon: Banknote, isNew: true },
      { title: "قائمة الدخل مقابل الميزانية", description: "تحليل الانحراف لكل بند", href: "/finance/reports/is-vs-budget", icon: ScaleIcon, isNew: true },
      { title: "خريطة حرارية للميزانية", description: "12 شهر × بنود — تكشف الانفجارات", href: "/finance/budget-heatmap", icon: Grid3x3, isNew: true },
      { title: "Y/Y Comparison", description: "مقارنة السنة مع التي قبلها", href: "/finance/reports/yoy", icon: TrendingUp },
      { title: "اتجاه قائمة الدخل", description: "P&L trend الشهري", href: "/finance/reports/is-trend", icon: Activity },
      { title: "معدل الحرق وفترة البقاء", description: "كم شهر تبقى لنا بالنقدية؟", href: "/finance/expense-burn-rate", icon: Flame, isNew: true },
      { title: "Cost Center P&L", description: "ربحية كل مركز تكلفة", href: "/finance/cost-center-pnl", icon: Layers },
      { title: "محفظة المركبات", description: "ربحية كل مركبة في الأسطول", href: "/finance/vehicle-portfolio", icon: BarChart3, isNew: true },
    ],
  },
  {
    title: "إدارة السيولة والنقد",
    icon: Banknote,
    color: "text-status-info-foreground",
    entries: [
      { title: "مراقبة الحسابات البنكية", description: "كل حسابات النقد في صفحة + sparkline", href: "/finance/bank-accounts-watch", icon: Banknote, isNew: true },
      { title: "تقويم النقدية 90 يوم", description: "Daily liquidity grid", href: "/finance/cash-calendar", icon: Calendar },
      { title: "Cash 13-Week", description: "13-week banking-grade forecast", href: "/finance/cash-13week", icon: Activity },
      { title: "Cash Flow Forecast", description: "توقع التدفقات النقدية", href: "/finance/cash-flow-forecast", icon: TrendingUp },
      { title: "تقويم دفعات الموردين", description: "ما يخرج من البنك خلال 30/60/90 يوم", href: "/finance/ap-payment-calendar", icon: Calendar, isNew: true },
    ],
  },
  {
    title: "ذمم مدينة (AR)",
    icon: Users,
    color: "text-status-success-foreground",
    entries: [
      { title: "منضدة التحصيل", description: "شاشة محصّل الديون اليومية", href: "/finance/ar-collection-workbench", icon: Users, isNew: true },
      { title: "اعمار الذمم المدينة", description: "AR Aging Report", href: "/finance/ar-aging", icon: Clock },
      { title: "كشف حساب عميل قابل للطباعة", description: "للإرسال للعميل بتنسيق A4", href: "/finance/customer-statement-print", icon: FileText, isNew: true },
      { title: "مخاطر العملاء", description: "نقاط مخاطر بناءً على التركّز", href: "/finance/customer-risk", icon: AlertTriangle },
      { title: "مخصص ديون مشكوك فيها", description: "ورقة عمل الإقفال الشهري", href: "/finance/bad-debt-provision", icon: TrendingDown, isNew: true },
      { title: "صف إرسال الفواتير", description: "فواتير معتمدة لم تُرسل بعد", href: "/finance/invoice-send-queue", icon: Send, isNew: true },
    ],
  },
  {
    title: "ذمم دائنة (AP)",
    icon: Briefcase,
    color: "text-status-warning-foreground",
    entries: [
      { title: "منضدة تسوية الموردين", description: "شاشة موظف الذمم الدائنة", href: "/finance/vendor-settlement-workbench", icon: Briefcase, isNew: true },
      { title: "أعمار الذمم الدائنة", description: "AP Aging Report", href: "/finance/ap-aging", icon: Clock },
      { title: "كشف حساب مورد قابل للطباعة", description: "للإرسال للمورد", href: "/finance/vendor-statement-print", icon: FileText, isNew: true },
      { title: "إنفاق الموردين", description: "Vendor Spend Analytics", href: "/finance/vendor-spend", icon: TrendingDown },
      { title: "Payment Run", description: "تنفيذ دفعات الموردين", href: "/finance/payment-run", icon: Banknote },
    ],
  },
  {
    title: "GL والقيود اليدوية",
    icon: ScaleIcon,
    color: "text-status-warning-foreground",
    entries: [
      { title: "ميزان مع تتبّع", description: "ميزان مراجعة + جدول الحركات لكل حساب", href: "/finance/trial-balance-drilldown", icon: ScaleIcon, isNew: true },
      { title: "كاشف الشذوذ", description: "6 أنماط مشبوهة في القيود", href: "/finance/gl-anomaly-detector", icon: AlertTriangle, isNew: true },
      { title: "ورقة عمل تسوية حساب", description: "تسوية أي GL لمصدر خارجي", href: "/finance/account-recon-workpaper", icon: FileSignature, isNew: true },
      { title: "قوالب قيود سريعة", description: "12 نموذج جاهز للاستخدام", href: "/finance/journal-quick-templates", icon: Layers, isNew: true },
      { title: "معالج عكس قيد", description: "3 خطوات آمنة لإنشاء قيد عاكس", href: "/finance/journal/reverse", icon: RotateCcw, isNew: true },
      { title: "تحويل بين الحسابات", description: "بطاقات مرئية source/target", href: "/finance/treasury/transfer", icon: Banknote },
      { title: "مصروف متعدد البنود", description: "مع ضرائب وعدم ضرائب مختلطة", href: "/finance/expenses/multi-line", icon: Receipt },
      { title: "Cost Splitter", description: "قسّم فاتورة على عدة جهات", href: "/finance/expenses/split", icon: Layers },
    ],
  },
  {
    title: "إقفال شهري / سنوي",
    icon: Calendar,
    color: "text-status-info-foreground",
    entries: [
      { title: "فحص قبل الإقفال", description: "10 فحوصات قبل إغلاق الفترة", href: "/finance/period-close-preflight", icon: AlertTriangle },
      { title: "Fiscal Periods", description: "إدارة الفترات المحاسبية", href: "/finance/fiscal-periods-v2", icon: Calendar },
      { title: "تقويم القيود المتكررة", description: "ما سيُرحَّل آلياً خلال 30 يوم", href: "/finance/recurring-calendar", icon: Calendar },
      { title: "Recurring Journals", description: "إدارة القيود المتكررة", href: "/finance/recurring-journals", icon: RotateCcw },
      { title: "Reconciliation Hub", description: "مركز التسويات", href: "/finance/reconciliation-hub", icon: ScaleIcon },
    ],
  },
  {
    title: "ضرائب وزكاة (ZATCA)",
    icon: FileCheck2,
    color: "text-purple-500",
    entries: [
      { title: "تقويم الإقرارات الضريبية", description: "VAT + WHT + GOSI + الزكاة طوال السنة", href: "/finance/tax-filing-calendar", icon: Calendar, isNew: true },
      { title: "جاهزية إقرار ZATCA", description: "3 شهور VAT + موعد التقديم", href: "/finance/vat-filing-readiness", icon: FileCheck2, isNew: true },
      { title: "ZATCA Reports Hub", description: "مركز تقارير ZATCA", href: "/finance/reports/zatca", icon: FileCheck2 },
      { title: "ملخص WHT", description: "ضريبة الاستقطاع", href: "/finance/reports/wht-summary", icon: Receipt },
      { title: "تسوية VAT", description: "VAT Reconciliation", href: "/finance/reports/vat-reconciliation", icon: ScaleIcon },
      { title: "Tax System", description: "إعدادات الضرائب", href: "/finance/tax", icon: Receipt },
    ],
  },
  {
    title: "أصول ثابتة",
    icon: Building2,
    color: "text-status-info-foreground",
    entries: [
      { title: "سجل الأصول الثابتة", description: "نظرة محفظية + توزيعات", href: "/finance/fixed-asset-register", icon: Building2, isNew: true },
      { title: "Fixed Assets CRUD", description: "إضافة/تعديل أصول", href: "/finance/fixed-assets", icon: Building2 },
      { title: "Batch Depreciate", description: "إهلاك دفعة واحدة", href: "/finance/fixed-assets/batch-depreciate", icon: TrendingDown },
    ],
  },
  {
    title: "صناديق الواردات / أتمتة",
    icon: Target,
    color: "text-status-info-foreground",
    entries: [
      { title: "Approvals Inbox", description: "7 طوابير في شاشة واحدة", href: "/finance/approvals-inbox", icon: Sparkles },
      { title: "ملف الجهة 360°", description: "كل المعاملات لأي جهة (11 نوع)", href: "/finance/entity-360", icon: Sparkles },
      { title: "GL Integrity Gaps", description: "ثغرات النزاهة في GL", href: "/finance/reports/gl-integrity-gaps", icon: AlertTriangle },
      { title: "Unmapped Lines", description: "بنود بدون ربط", href: "/finance/reports/unmapped-lines", icon: AlertTriangle },
      { title: "Posting Activity", description: "نشاط الترحيل", href: "/finance/journal/activity", icon: Activity },
      { title: "منضدة العُهد", description: "عُهد كل موظف مع أعمار وتسوية", href: "/finance/custody-workbench", icon: Users, isNew: true },
    ],
  },
];

export default function FinanceWorkflowsHubPage() {
  const [search, setSearch] = useState("");
  const [showNewOnly, setShowNewOnly] = useState(false);

  const filtered = useMemo(() => {
    return CATEGORIES.map(cat => {
      let entries = cat.entries;
      if (showNewOnly) {
        entries = entries.filter(e => e.isNew);
      }
      if (search) {
        const s = search.toLowerCase();
        entries = entries.filter(e =>
          e.title.toLowerCase().includes(s) ||
          e.description.toLowerCase().includes(s)
        );
      }
      return { ...cat, entries };
    }).filter(cat => cat.entries.length > 0);
  }, [search, showNewOnly]);

  const totalEntries = CATEGORIES.reduce((s, c) => s + c.entries.length, 0);
  const newEntries = CATEGORIES.reduce((s, c) => s + c.entries.filter(e => e.isNew).length, 0);
  const visibleEntries = filtered.reduce((s, c) => s + c.entries.length, 0);

  return (
    <PageShell
      title="مركز سير عمل المالية"
      subtitle={`${totalEntries} صفحة عمل عميقة منظمة في ${CATEGORIES.length} مجموعة`}
    >
      <FinanceTabsNav />

      {/* Search */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground mb-1 block">بحث عن سير عمل</label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مثال: إهلاك، تحصيل، ميزانية، VAT..."
                className="pr-9"
              />
            </div>
          </div>
          <Button
            variant={showNewOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowNewOnly(s => !s)}
          >
            <Sparkles className="w-4 h-4 ml-1" />
            {showNewOnly ? "إظهار الكل" : `الجديد فقط (${newEntries})`}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1">إجمالي سير العمل</div>
            <div className="text-2xl font-bold tabular-nums">{totalEntries}</div>
          </CardContent>
        </Card>
        <Card className={newEntries > 0 ? "border-status-success-foreground" : ""}>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-status-success-foreground" />
              جديد في هذه الدفعة
            </div>
            <div className="text-2xl font-bold tabular-nums text-status-success-foreground">
              {newEntries}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1">معروض حالياً</div>
            <div className="text-2xl font-bold tabular-nums">{visibleEntries}</div>
          </CardContent>
        </Card>
      </div>

      {/* Categories */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا نتائج مطابقة
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((cat, i) => {
            const CatIcon = cat.icon;
            return (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CatIcon className={`w-5 h-5 ${cat.color}`} />
                    {cat.title}
                    <Badge variant="outline" className="text-[10px]">{cat.entries.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {cat.entries.map((e, j) => {
                      const Icon = e.icon;
                      return (
                        <Link key={j} href={e.href}>
                          <div className="border rounded p-3 hover:bg-muted/30 cursor-pointer transition group">
                            <div className="flex items-start gap-2">
                              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cat.color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="font-semibold text-sm">{e.title}</span>
                                  {e.isNew && (
                                    <Badge className="text-[9px] h-4 bg-status-success-foreground text-white">
                                      جديد
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground leading-tight">
                                  {e.description}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
