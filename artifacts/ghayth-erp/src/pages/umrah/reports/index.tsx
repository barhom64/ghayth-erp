import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import {
  Wallet, Users, ClipboardList, Scale, Shield, AlertTriangle,
  TrendingUp, Calendar, Bus, FileText,
} from "lucide-react";

// لوحة التقارير — كل التقارير المتوفرة في نظام العمرة في شاشة واحدة
// مع وصف مختصر لكل تقرير. كانت متفرقة بين tabs / sidebar / صفحات
// محددة بدون نقطة دخول موحدة.

interface ReportTile {
  href: string;
  title: string;
  description: string;
  icon: any;
  tone: string;
  category: "مالية" | "تشغيلية" | "امتثال";
}

const REPORTS: ReportTile[] = [
  {
    href: "/umrah/reports/agent-balances",
    title: "أرصدة الوكلاء",
    description: "كل الوكلاء في صف واحد مع المُفوتر / المُحصَّل / المستحق وآخر فاتورة",
    icon: Wallet,
    tone: "text-status-success-foreground bg-status-success-surface",
    category: "مالية",
  },
  {
    href: "/umrah/reports/subagent-balances",
    title: "أرصدة الوكلاء الفرعيين",
    description: "الوكلاء الفرعيون (مصدر الدفعات الفعلي) — المُفوتر، المُحصَّل، الدفعات، الرصيد",
    icon: Wallet,
    tone: "text-status-success-foreground bg-status-success-surface",
    category: "مالية",
  },
  {
    href: "/umrah/reports/pilgrim-movements",
    title: "حركة المعتمرين",
    description: "وصول / مغادرة / تجاوز / متأخر عن المغادرة — لقطة يومية مع drill-down",
    icon: Users,
    tone: "text-status-info-foreground bg-status-info-surface",
    category: "تشغيلية",
  },
  {
    href: "/finance/umrah-group-portfolio",
    title: "محفظة المجموعات",
    description: "ربحية كل مجموعة (مبيعات − تكلفة نسك) + best/worst + جدول كامل",
    icon: TrendingUp,
    tone: "text-status-success-foreground bg-status-success-surface",
    category: "مالية",
  },
  {
    href: "/finance/umrah-season-portfolio",
    title: "محفظة المواسم",
    description: "مقارنة ربحية المواسم عبر السنوات في شاشة واحدة",
    icon: Calendar,
    tone: "text-status-success-foreground bg-status-success-surface",
    category: "مالية",
  },
  {
    href: "/umrah/daily-runsheet",
    title: "كشف اليوم التشغيلي",
    description: "وصول + مغادرة + متجاوزون في تاريخ محدَّد",
    icon: ClipboardList,
    tone: "text-status-info-foreground bg-status-info-surface",
    category: "تشغيلية",
  },
  {
    href: "/umrah/reconciliation",
    title: "المطابقة (نسك ↔ النظام)",
    description: "فجوات المبالغ + فروق الأعداد + الـ overstay gaps",
    icon: Scale,
    tone: "text-status-warning-foreground bg-status-warning-surface",
    category: "امتثال",
  },
  {
    href: "/umrah/compliance",
    title: "لوحة الامتثال",
    description: "4 KPIs: المستثنون / تأشيرات منتهية / متأخرون / غرامات غير مسددة",
    icon: AlertTriangle,
    tone: "text-status-error-foreground bg-status-error-surface",
    category: "امتثال",
  },
  {
    href: "/umrah/exempt-pilgrims",
    title: "المستثنون من مسح التأخّر",
    description: "كل المعتمرين المستثنون + من أصدر الاستثناء ومتى",
    icon: Shield,
    tone: "text-status-info-foreground bg-status-info-surface",
    category: "امتثال",
  },
  {
    href: "/umrah/transport",
    title: "النقل",
    description: "رحلات النقل + استخدام الباص + تخصيص السائق",
    icon: Bus,
    tone: "text-status-info-foreground bg-status-info-surface",
    category: "تشغيلية",
  },
  {
    href: "/umrah/penalties",
    title: "الغرامات",
    description: "كل غرامات التجاوز / المخالفات + الإصدار + الإعفاء",
    icon: FileText,
    tone: "text-status-warning-foreground bg-status-warning-surface",
    category: "مالية",
  },
];

export default function UmrahReportsHub() {
  // Group by category for visual organisation
  const byCategory = REPORTS.reduce<Record<string, ReportTile[]>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <PageShell
      title="تقارير العمرة"
      subtitle="كل التقارير المتاحة في شاشة واحدة — مالية / تشغيلية / امتثال"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "التقارير" }]}
    >
      <UmrahTabsNav />

      {(["مالية", "تشغيلية", "امتثال"] as const).map((cat) => (
        <Card key={cat} data-testid={`umrah-reports-section-${cat}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{cat}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(byCategory[cat] ?? []).map((r) => (
                <Link key={r.href} href={r.href} data-testid={`umrah-reports-tile-${r.href.replace(/\//g, "-").replace(/^-/, "")}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded ${r.tone}`}>
                        <r.icon className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-semibold mt-2">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </PageShell>
  );
}
