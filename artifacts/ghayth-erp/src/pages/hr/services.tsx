/**
 * HR Services Catalog (#1799 priority #4).
 *
 * Single landing page from which an employee can launch every
 * self-service action HR offers — instead of scrolling through a
 * sprawling sidebar menu. Each card is a router-link that opens the
 * existing create-form page for that service. We deliberately do NOT
 * embed the forms here; reusing the existing per-feature create
 * routes (/hr/leaves/create, /hr/loans/create, etc.) means we inherit
 * all their validation + workflow wiring for free.
 *
 * Per the inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §F #4):
 *
 *   «بناء صفحة "خدمات HR" تجمع الخدمات (طلب إجازة، طلب OT، عذر، قرض،
 *    ...) كـ catalog»
 *
 * The catalog is RBAC-aware: cards check the feature/action permission
 * via `usePermissions` so an employee without `hr.loans:create` sees
 * the loan card greyed-out with a tooltip instead of clicking through
 * to a 403.
 */
import { Link } from "wouter";
import {
  PageShell,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, ClipboardEdit, CreditCard, FileText, ArrowLeftRight, Award, ShieldAlert, type LucideIcon } from "lucide-react";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

type ServiceCategory = "time-off" | "compensation" | "career" | "compliance";

interface Service {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: ServiceCategory;
  /** Optional badge label to highlight new or featured services. */
  badge?: string;
}

const SERVICES: Service[] = [
  // ── Time-off cluster ──
  {
    key: "leave",
    title: "طلب إجازة",
    description: "إجازة سنوية، مرضية، طارئة، أو بدون راتب. يُحوَّل تلقائيًا إلى المدير ثم HR.",
    href: "/hr/leaves/create",
    icon: Calendar,
    category: "time-off",
  },
  {
    key: "overtime",
    title: "طلب وقت إضافي",
    description: "تسجيل ساعات عمل إضافية باعتماد المدير. يُحسب بمعامل 1.5× وفق نظام العمل السعودي.",
    href: "/hr/overtime/create",
    icon: Clock,
    category: "time-off",
  },
  {
    key: "excuse",
    title: "طلب عذر",
    description: "تأخر في الدخول، انصراف مبكر، أو غياب جزئي. يُسوّى الخصم تلقائيًا عند الاعتماد.",
    href: "/hr/excuse-requests/create",
    icon: ClipboardEdit,
    category: "time-off",
  },
  // ── Compensation cluster ──
  {
    key: "loan",
    title: "طلب سلفة / قرض",
    description: "سلفة راتب، شخصية، أو طارئة. الخصم آلي من راتب الأشهر التالية.",
    href: "/hr/loans/create",
    icon: CreditCard,
    category: "compensation",
  },
  {
    key: "letter",
    title: "طلب خطاب رسمي",
    description: "خطاب راتب، تعريف بالعمل، أو تأشيرة. يصدر بالعدد التتابعي عبر مركز الترقيم.",
    href: "/hr/official-letters/create",
    icon: FileText,
    category: "compensation",
  },
  // ── Career cluster ──
  {
    key: "transfer",
    title: "طلب نقل / تغيير قسم",
    description: "نقل بين الفروع أو الأقسام. يحتاج موافقة المدير الحالي + الجديد + HR.",
    href: "/hr/transfers/create",
    icon: ArrowLeftRight,
    category: "career",
    badge: "مدير فقط",
  },
  {
    key: "training",
    title: "تسجيل في دورة تدريبية",
    description: "اشترك في برامج التدريب المعتمدة. يظهر الإنجاز في تقييمك الذاتي.",
    href: "/hr/training",
    icon: Award,
    category: "career",
  },
  // ── Compliance cluster ──
  {
    key: "exit",
    title: "طلب نهاية خدمة",
    description: "استقالة، تقاعد، أو نهاية عقد. يفعّل مكافأة نهاية الخدمة وفق نظام العمل.",
    href: "/hr/exit-requests/create",
    icon: ShieldAlert,
    category: "compliance",
    badge: "حساس",
  },
];

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  "time-off": "الوقت والإجازات",
  "compensation": "الراتب والمستحقات",
  "career": "المسار الوظيفي",
  "compliance": "الامتثال ونهاية الخدمة",
};

const CATEGORY_COLORS: Record<ServiceCategory, string> = {
  "time-off": "bg-status-info-surface text-status-info-foreground",
  "compensation": "bg-emerald-50 text-emerald-700",
  "career": "bg-purple-50 text-purple-700",
  "compliance": "bg-status-warning-surface text-status-warning-foreground",
};

export default function HrServicesCatalog() {
  // Group services by category for the card layout.
  const grouped = SERVICES.reduce<Record<string, Service[]>>((acc, svc) => {
    (acc[svc.category] ||= []).push(svc);
    return acc;
  }, {});

  return (
    <PageShell
      title="خدمات الموارد البشرية"
      subtitle="كل ما يمكنك طلبه من HR في مكان واحد — اختر الخدمة لفتح النموذج المناسب."
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <HrTabsNav />
      <div className="space-y-8">
        {Object.entries(grouped).map(([category, services]) => (
          <section key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {CATEGORY_LABELS[category as ServiceCategory]}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {services.map((svc) => {
                const Icon = svc.icon;
                return (
                  <Link key={svc.key} href={svc.href}>
                    <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[svc.category]}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          {svc.badge && (
                            <Badge variant="outline" className="text-[10px]">
                              {svc.badge}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base mt-2">{svc.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {svc.description}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
