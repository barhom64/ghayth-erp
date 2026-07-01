import { useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  BookOpen, Percent, Receipt, Workflow, Package, Eye, Globe, RefreshCw,
  Calendar, Wallet, Settings as SettingsIcon, Layers, Handshake, ClipboardList,
  History, ShieldAlert, ShieldCheck,
} from "lucide-react";

/**
 * Finance Settings Hub — single landing page for all admin / setup
 * pages added during the line-level allocation campaign + the tax
 * + WHT registries. Replaces "scattered URLs" with one navigation
 * surface for the finance admin.
 */

interface SettingsCard {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  group: "registries" | "allocation" | "currency" | "periods" | "procurement";
}

const CARDS: SettingsCard[] = [
  // ── Tax / WHT registries ─────────────────────────────────────
  {
    href: "/finance/accounts",
    title: "دليل الحسابات (Chart of Accounts)",
    description: "إدارة شجرة الحسابات — أصول / خصوم / حقوق ملكية / إيرادات / مصروفات. حماية من تكرار الرمز ومن تغيير النوع بعد الاستخدام.",
    icon: BookOpen,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "registries",
  },
  {
    href: "/finance/tax-codes",
    title: "رموز الضريبة (Tax Codes)",
    description: "VAT15 / VAT0 / EXEMPT / OOS / RCM15 — ربط بالحسابات + إعدادات شامل/غير شامل + ربط بـ ZATCA codes.",
    icon: Percent,
    iconClass: "text-purple-600 bg-purple-50",
    group: "registries",
  },
  {
    href: "/finance/wht-categories",
    title: "فئات الاستقطاع (WHT)",
    description: "10 فئات سعودية مبذورة (إتاوات 15% / خدمات فنية 15% / إدارة 20% / فوائد 5% / ...) قابلة للتعديل.",
    icon: Receipt,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "registries",
  },
  {
    href: "/finance/cost-centers",
    title: "مراكز التكلفة (Cost Centers)",
    description: "أبعاد محاسبية لكل بند قيد (JE) — تحليل الأرباح حسب المشروع / المركبة / الإدارة. تستخدمها قواعد التوجيه عبر استراتيجيات from_*.",
    icon: Layers,
    iconClass: "text-purple-600 bg-purple-50",
    group: "registries",
  },

  // ── Allocation engine ────────────────────────────────────────
  {
    href: "/finance/allocation-rules",
    title: "قواعد التوجيه المحاسبي",
    description: "قواعد توجيه تلقائية — تحدد كيف يتم توجيه كل بند مالي إلى حسابه ومركز تكلفته وكيانه التشغيلي تلقائياً.",
    icon: Workflow,
    iconClass: "text-emerald-700 bg-emerald-50",
    group: "allocation",
  },
  {
    href: "/finance/product-catalog",
    title: "كتالوج المنتجات والخدمات",
    description: "كتالوج محاسبي للمنتجات — كل منتج/خدمة له توجيه افتراضي للحساب ومركز التكلفة والكيان المرتبط ينطبق تلقائياً عند الاختيار.",
    icon: Package,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "allocation",
  },
  {
    href: "/finance/allocation-results",
    title: "سجل توجيه البنود (سجل التدقيق)",
    description: "كل قرار توجيه يحفظه محرك التوجيه — أي بند، أي قاعدة، أي حساب ومركز تكلفة. التجاوز اليدوي مع السبب.",
    icon: Eye,
    iconClass: "text-orange-600 bg-orange-50",
    group: "allocation",
  },
  {
    href: "/finance/allocation-override-log",
    title: "سجل تجاوزات التخصيص",
    description: "كل اعتماد بصلاحية finance.allocation.override تجاوز الإلزام — مع السبب المكتوب وقائمة الموانع وقت الاعتماد. للمراجعة والحوكمة.",
    icon: ShieldAlert,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "allocation",
  },

  // ── Multi-currency ───────────────────────────────────────────
  {
    href: "/finance/fx-rates",
    title: "أسعار صرف العملات",
    description: "إدارة أسعار الصرف (USD/EUR/AED/...) — يدوية أو من البنك المركزي. تُستخدم في الفواتير متعددة العملات.",
    icon: Globe,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "currency",
  },
  {
    href: "/finance/fx-revaluation",
    title: "إعادة تقييم العملات (FX Revaluation)",
    description: "قيد شهري لتعديل قيمة الفواتير وأوامر الشراء المفتوحة بعملات أجنبية إلى سعر إقفال الفترة.",
    icon: RefreshCw,
    iconClass: "text-emerald-600 bg-emerald-50",
    group: "currency",
  },
  {
    href: "/finance/fx-revaluation/history",
    title: "سجل إعادة التقييم",
    description: "كل قيود FX revaluation اللي أُنشئت — الأثر التراكمي على الأرباح/الخسائر من تذبذب أسعار الصرف عبر الفترات.",
    icon: History,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "currency",
  },

  // ── Procurement (Purchase Requests / Vendor Contracts) ───────
  {
    href: "/finance/purchase-requests",
    title: "طلبات الشراء",
    description: "تدفّق طلب الشراء قبل إصدار PO — اعتماد ثم تحويل إلى أمر شراء رسمي. حوكمة مسبقة على الالتزامات.",
    icon: ClipboardList,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "procurement",
  },
  {
    href: "/finance/contracts",
    title: "عقود الموردين (Vendor Contracts)",
    description: "إدارة عقود الإطار مع الموردين، تنبيهات قبل انتهاء العقد بـ 30 يوم لتفادي انقطاع التوريد.",
    icon: Handshake,
    iconClass: "text-emerald-700 bg-emerald-50",
    group: "procurement",
  },

  // ── Periods & close ──────────────────────────────────────────
  {
    href: "/finance/fiscal-periods-v2",
    title: "الفترات المالية",
    description: "تقفيل/فتح الفترات الشهرية — يمنع الترحيل في فترات مقفلة. مع سياسة قفل بعد الإقرار الضريبي.",
    icon: Calendar,
    iconClass: "text-status-warning-foreground bg-status-warning-surface",
    group: "periods",
  },
  {
    href: "/finance/year-end-close",
    title: "إقفال السنة المالية",
    description: "ترحيل الأرباح/الخسائر للأرباح المحتجزة. يستلزم إقفال كل الـ 12 فترة + GL integrity gaps clean.",
    icon: Wallet,
    iconClass: "text-purple-700 bg-purple-50",
    group: "periods",
  },
  {
    href: "/finance/opening-balances",
    title: "الأرصدة الافتتاحية",
    description: "إدخال الأرصدة الافتتاحية عند بدء العمل بالنظام — مع CSV import للأرصدة الكبيرة.",
    icon: BookOpen,
    iconClass: "text-status-info-foreground bg-status-info-surface",
    group: "periods",
  },
];

const GROUP_INFO: Record<SettingsCard["group"], { label: string; description: string }> = {
  registries: {
    label: "🗂 السجلات الأساسية",
    description: "دليل الحسابات + رموز الضرائب + فئات الاستقطاع",
  },
  allocation: {
    label: "⚙ محرك التوجيه المحاسبي (Line-Level Allocation)",
    description: "القواعد + الكتالوج + سجل القرارات",
  },
  currency: {
    label: "🌍 العملات المتعددة (Multi-Currency)",
    description: "الأسعار + إعادة التقييم الشهرية",
  },
  periods: {
    label: "📅 الفترات والإقفالات",
    description: "الفترات المالية + إقفال السنة + الأرصدة الافتتاحية",
  },
  procurement: {
    label: "🛒 المشتريات (Procurement)",
    description: "طلبات الشراء + عقود الموردين",
  },
};

const GROUP_ORDER: SettingsCard["group"][] = ["registries", "allocation", "currency", "periods", "procurement"];

function EnforceLineAllocationToggle() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useApiQuery<{ enforce: boolean; key: string }>(
    ["finance-settings-enforce-line-allocation"],
    "/finance/settings/enforce-line-allocation",
  );
  const enforce = !!data?.enforce;

  async function toggle() {
    if (isLoading || saving) return;
    setSaving(true);
    try {
      await apiFetch("/finance/settings/enforce-line-allocation", {
        method: "PUT",
        body: JSON.stringify({ enforce: !enforce }),
      });
      await qc.invalidateQueries({ queryKey: ["finance-settings-enforce-line-allocation"] });
      toast({ title: !enforce ? "تم تفعيل الإلزام بتخصيص البنود" : "تم إيقاف الإلزام بتخصيص البنود" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر التحديث", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={enforce
      ? "mb-6 border-status-success-surface bg-status-success-surface/30"
      : "mb-6 border-status-warning-surface bg-status-warning-surface/30"}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {enforce
            ? <ShieldCheck className="h-6 w-6 text-status-success-foreground" />
            : <ShieldAlert className="h-6 w-6 text-status-warning-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="font-semibold">
              الإلزام بتخصيص بنود المستندات (Line-Level Allocation Enforcement)
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className={enforce ? "text-status-success-foreground" : "text-status-warning-foreground"}>
                {enforce ? "مُفعَّل" : "معطّل"}
              </Badge>
              <Switch checked={enforce} onCheckedChange={toggle} disabled={isLoading || saving} aria-label="تبديل الإلزام" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {enforce ? (
              <>
                وضع <strong>الإنتاج</strong>: لا يمكن اعتماد أي فاتورة أو إيصال GRN يحتوي على بند بدون
                تخصيص محاسبي (status=unmapped). الـ fallback إلى الحساب العام مرفوض إلا بصلاحية
                <code className="px-1 bg-muted rounded mx-1">finance.allocation.override</code>
                مع سبب مكتوب يُحفظ في سجل التجاوزات.
              </>
            ) : (
              <>
                وضع <strong>التساهل (الوضع الافتراضي)</strong>: البنود غير المخصصة تنزل تلقائياً على الحساب
                العام (invoice_revenue / inventory). آمن للهجرة من نظام قديم لكن غير مناسب للإنتاج النهائي —
                فعّل الإلزام بعد إنشاء قواعد التوجيه المحاسبي.
              </>
            )}
          </p>
          <div className="flex gap-2 mt-2">
            <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-rules">قواعد التوجيه</Link></Button>
            <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-override-log">سجل التجاوزات</Link></Button>
            <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-coverage">تغطية التخصيص</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceSettingsHubPage() {
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    info: GROUP_INFO[g],
    cards: CARDS.filter((c) => c.group === g),
  }));

  return (
    <PageShell
      title="مركز إعدادات النظام المالي"
      subtitle="كل الإعدادات الإدارية للنظام المالي في صفحة واحدة — دليل الحسابات، الضرائب، التوجيه المحاسبي، العملات، الفترات"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "الإعدادات" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_settings_hub"
          entityId="list"
          size="icon"
          payload={{
            entity: { title: "مركز إعدادات النظام المالي", total: CARDS.length },
            items: CARDS.map((c) => ({
              "المجموعة": GROUP_INFO[c.group]?.label || c.group,
              "العنوان": c.title,
              "الوصف": c.description,
            })),
          }}
        />
      }
    >
      <FinanceTabsNav />
      <EnforceLineAllocationToggle />

      <Card className="mb-6 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> لماذا هذا المركز؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            من حملة الإصلاح المالي وLine-Level Allocation، أُضيفت كثير من الصفحات
            الإدارية. هذا المركز يجمعها في مكان واحد بحيث يقدر المسؤول المالي يرى
            كل مكونات النظام المالي ويفتح ما يحتاج إلى تعديل بنقرة واحدة.
          </p>
        </CardContent>
      </Card>

      {grouped.map((g) => (
        <div key={g.group} className="mb-6">
          <div className="mb-3">
            <h3 className="text-base font-semibold">{g.info.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{g.info.description}</p>
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.href} href={c.href}>
                  <Card className="cursor-pointer hover:shadow-md hover:border-status-info-surface transition-all h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${c.iconClass} shrink-0`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm mb-1">{c.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {c.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <Card className="mt-8 bg-muted/30">
        <CardContent className="p-4 text-center">
          <Badge variant="outline" className="text-xs">
            {CARDS.length} صفحة إدارية موزعة على {GROUP_ORDER.length} مجموعة
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            هذي الصفحات أُضيفت تباعاً خلال حملة Line-Level Accounting Allocation +
            تكامل ZATCA + الـ Daftra-style tax. التقارير المالية في
            <Link href="/finance/reports" className="text-status-info-foreground hover:underline mx-1">/finance/reports</Link>
            و
            <Link href="/finance/reports/zatca" className="text-status-info-foreground hover:underline mx-1">/finance/reports/zatca</Link>.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
