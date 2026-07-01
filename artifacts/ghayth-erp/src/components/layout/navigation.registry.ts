// navigation.registry.ts
//
// SINGLE SOURCE OF TRUTH for application navigation.
//
// Per an explicit, informed owner decision (recorded 2026-06), the navigation
// tree was lifted out of sidebar-layout.tsx into this dedicated registry so it
// can be (a) consumed by the sidebar, the /services hub and the command
// palette without duplication, and (b) governed by an automated gate
// (scripts/src/check-sidebar-coverage.mjs). This supersedes the earlier
// "menu lives only in sidebar-layout" stance (MENU_GOVERNANCE rule #1418):
// there is still exactly ONE menu — it is just defined here instead of inline.
//
// The structured `allNavSections` below is the canonical definition consumed by
// the React sidebar (filtering pipeline stays in sidebar-layout.tsx). The flat
// `getNavigationRegistry()` view derives per-page governance metadata from it.

import { ModuleType } from "@/contexts/app-context";
import {
  LayoutDashboard, Users, Building2, CreditCard, FileText, Truck, Home, Banknote,
  Shield, ChevronDown, ChevronLeft, Clock, Calendar, DollarSign, GraduationCap,
  Paperclip,
  Target, Network, Receipt, Wallet, Car, Wrench, Fuel, User, Coins,
  FileCheck, AlertTriangle, ClipboardCheck, Building, FileSignature, Users2,
  Hammer, TrendingUp, FileBarChart, FolderOpen, Archive, ListTodo, GitBranch,
  FilePlus, CalendarClock, ScrollText, Cog, Bell, Mail, Inbox,
  MessageSquare, Scale, Briefcase, Megaphone, ShoppingCart, Package, Activity,
  LineChart, Menu, X, LogOut, Headphones, CheckCircle,
  KeyRound, CloudRain, MapPin, QrCode, FileSignature as FileSignature2,
  BarChart3, UserPlus, ClipboardList, Navigation, Percent, Zap,
  Sparkles, Brain, Search, ArrowLeftRight,
  Plus, Printer, CheckSquare, Download, Send, Star, Settings, BookOpen, Radar, Timer, ListChecks,
  HelpCircle, Image as ImageIcon,
  BarChart2, ShieldAlert, Flag, Layers, Calculator, LayoutGrid,
  RefreshCw, Globe, TrendingDown as TrendingDown2,
  Satellite, Bot, HardDrive, Video as VideoIcon, Award,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: any;
  module?: ModuleType;
  subKey?: string;
  minRoleLevel?: number;
  /**
   * Fine-grained backend permission required to see this menu entry.
   * Accepts a single `module:action` string (e.g. "finance:create") or an
   * array of them. When provided, the item is hidden for users whose
   * permission set doesn't satisfy the check — preferred over relying on
   * the server to 403 after the click.
   */
  perm?: string | string[];
  /** "all" (default) — must hold every perm; "any" — hold at least one. */
  permMode?: "all" | "any";
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const allNavSections: NavSection[] = [
  // ══════════════════════════════════════════════════════════════════════
  // 1. الرئيسية — لوحات + مراكز التحكم + بوابة الموظف
  // ══════════════════════════════════════════════════════════════════════
  // Restructured from a flat 10-item list into three logical sub-groups
  // so the accordion behavior actually saves vertical space. Order
  // reflects use-frequency: dashboard / calendar at top (every-day),
  // then "my space" cluster (every user), then management dashboards
  // (managers), then control centers (approvers/operators).
  {
    title: "الرئيسية",
    items: [
      { label: "لوحة التحكم", path: "/dashboard", icon: LayoutDashboard, module: "home" },
      // PR-5 (#2077) — صندوق الأعمال الموحّد. Promoted to the top of
      // «الرئيسية» so it's the first thing every operator sees on
      // login. Replaces the 5-screen morning routine (notifications +
      // action-center + hr/approval-inbox + finance/approvals-inbox +
      // tasks) with a single canonical page.
      { label: "صندوق الأعمال", path: "/work-inbox", icon: Inbox },
      { label: "كل الخدمات", path: "/services", icon: LayoutGrid },
      { label: "التقويم الموحد", path: "/calendar", icon: Calendar },
      { label: "مساحاتي", path: "/my-space", icon: User, children: [
        { label: "مساحتي", path: "/my-space", icon: User },
        { label: "صندوق الأعمال", path: "/work-inbox", icon: ListChecks },
        // PR-9 (#2077) — رفيق الميدان. The page itself checks the
        // category-policy eligibility; non-field categories see the
        // «فئتك لا تخضع للتتبع» banner and never get a location prompt.
        { label: "رفيق الميدان", path: "/my/field-companion", icon: MapPin },
        { label: "مساحة العمل", path: "/workspace", icon: LayoutGrid },
        { label: "إشعاراتي", path: "/notifications", icon: Bell },
      ]},
      { label: "لوحات الإدارة", path: "/manager-board", icon: Users, minRoleLevel: 50, children: [
        { label: "لوحة المدير", path: "/manager-board", icon: Users },
        { label: "مساحة المدير", path: "/manager-workspace", icon: Users },
        { label: "لوحات مؤشرات المسارات", path: "/module-dashboards", icon: LayoutDashboard },
        { label: "لوحة القيادة التنفيذية", path: "/exec-dashboard", icon: Shield, minRoleLevel: 70 },
        { label: "اسأل غيث", path: "/assistant", icon: Sparkles, minRoleLevel: 70 },
      ]},
      { label: "مراكز التحكم", path: "/action-center", icon: Briefcase, minRoleLevel: 50, children: [
        { label: "مركز القرارات", path: "/action-center", icon: Briefcase },
        { label: "مركز العمليات", path: "/operations-center", icon: Zap, minRoleLevel: 50 },
        { label: "مركز الالتزامات", path: "/obligations", icon: Clock },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 2. بوابة الموظف — مقسّم على مجموعتين: طلباتي + معلوماتي
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "بوابة الموظف",
    items: [
      { label: "طلباتي", path: "/my-requests", icon: ClipboardCheck, children: [
        { label: "كل طلباتي", path: "/my-requests", icon: ClipboardCheck },
        // HR-010 / #1799 priority #4 — صفحة كتالوج خدمات HR الموحّدة:
        // بدل أن يبحث الموظف عن كل طلب في صفحة مختلفة، يفتح صفحة
        // واحدة فيها كل ما يمكن طلبه من HR كبطاقات منظّمة بالفئة.
        { label: "خدمات الموارد البشرية", path: "/hr/services", icon: ClipboardCheck },
        { label: "طلب إجازة", path: "/hr/leaves/create", icon: Calendar },
      ]},
      { label: "معلوماتي", path: "/my-attendance", icon: User, children: [
        { label: "حضوري وانصرافي", path: "/my-attendance", icon: Clock },
        { label: "كشف راتبي", path: "/my-payslip", icon: DollarSign },
        { label: "سلفي", path: "/my-loans", icon: Wallet },
        { label: "ساعاتي الإضافية", path: "/my-overtime", icon: Timer },
        { label: "تقييمي", path: "/my-performance", icon: Target },
        { label: "مستنداتي", path: "/my-documents", icon: FileText },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 3. الموارد البشرية (مرتبة حسب دورة حياة الموظف)
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الموارد البشرية",
    // HR-011 / #1799 priority #12 — Menu cleanup per inventory §D.2.
    //
    // Before: 17 top-level items, with overlapping clusters (الورديات
    // separate from الحضور، الانضباط مشتت بـ 6 سطور، التوظيف منفصل
    // عن الموظفين، التدريب منفصل عن الأداء…).
    //
    // After: 9 top-level entries matching the canonical structure
    // from #1799:
    //   1. لوحة HR
    //   2. الموظفون
    //   3. النشاط والحضور
    //   4. الطلبات
    //   5. الامتثال والجزاءات
    //   6. الأداء والتطوير
    //   7. الرواتب
    //   8. التقارير
    //   9. الإعدادات
    //
    // **Critical rule**: every legacy /hr/* route still exists. We
    // only restructure the MENU, not the routes themselves. Old
    // bookmarks + deep-links keep working.
    items: [
      // إدارة الموارد البشرية — مدخل وحدة واحد يجمع مجموعات HR الفرعية (نفس نمط
      // «إدارة العمرة»/«إدارة الأسطول»). كانت 11 مدخلًا مسطّحًا، فأُعيد تجميعها تحت
      // مدخل واحد: اللوحة أولاً ثم دورة العمل ثم التقارير ثم الإعدادات آخراً. إعادة
      // تجميع فقط — كل مسار/صلاحية/تسمية محفوظ (لا أيتام ولا روابط ميتة).
      { label: "إدارة الموارد البشرية", path: "/hr", icon: Briefcase, module: "hr", children: [
        // 1. لوحة HR
        // PR-1 / #2163 — was module:"bi" (FU-2). hr_manager owns hr, not bi.
        // RBAC-REV-STD (#2761) — لوحتا HR الإداريتان بلا subKey، فلا يحرسهما
        // canAccessSubPage. minRoleLevel:25 يُخفيهما عن الموظف الاستاندر (10)
        // والسائق (15) — اللذين تظهر وحدتهما «hr» عبر منحة ذاتية فقط — مع
        // إبقائهما للأدوار الوظيفية في HR. يبقى module:"hr" صريحًا على لوحتَي القياس
        // (لا على الأب فقط): يطابق نمط «إدارة الأسطول» ويحرسه platformWave2Pr1…Decoupling.
        { label: "لوحة الموارد البشرية", path: "/module-dashboards?tab=hr", icon: LayoutDashboard, module: "hr", minRoleLevel: 25 },
        // بوابة /hr — لوحة تشغيلية خاصة بفريق الموارد البشرية (مؤشرات وروابط
        // سريعة لا تظهر في اللوحة العامة). كانت مركّبة بلا مدخل (orphan).
        { label: "مركز الموارد البشرية", path: "/hr", icon: Briefcase, module: "hr", minRoleLevel: 25 },

        // 2. الموظفون — gathers recruitment, employees, onboarding,
        // org structure, transfers, documents, contracts, letters, exit
        { label: "شؤون الموظفين", path: "/employees", icon: Users, children: [
          { label: "قائمة الموظفين", path: "/employees", icon: Users, subKey: "employees" },
          { label: "إنشاء موظف سريع", path: "/employees/quick-create", icon: Zap, subKey: "employees" },
          { label: "نقل الموظفين", path: "/hr/transfers", icon: ArrowLeftRight, subKey: "employees" },
          { label: "الوثائق المنتهية", path: "/hr/expiring-documents", icon: AlertTriangle, subKey: "employees" },
          // ADR-HR-02 (#2221) — توحيد القائمة: مدخل هيكل واحد → org-tree (canonical،
          // PR-7 «الموحّد»). أُزيل تكرار «الهيكل المصوّر» وعنصر org-tree المنفصل في
          // إعدادات HR. مسارا /hr/organization (عرض المناصب) و .../structure (العلاقات)
          // يبقيان مسجَّلين deep-link — لا حذف ولا 404. متابعة: نقل عرضَي «المناصب»
          // و«العلاقات» إلى org-tree كتبويبات ثم retire الصفحتين.
          { label: "الهيكل التنظيمي", path: "/hr/org-tree", icon: Network, subKey: "organization" },
          { label: "التفويضات", path: "/hr/delegations", icon: Users2, subKey: "organization" },
          { label: "وثائق المنشأة والموظفين", path: "/hr/documents", icon: FileText, subKey: "employees" },
          { label: "عقود الموظفين", path: "/hr/contracts", icon: FileSignature, subKey: "employees" },
          { label: "الخطابات الرسمية", path: "/hr/official-letters", icon: FileSignature2, subKey: "employees" },
          { label: "نهاية الخدمة", path: "/hr/exit", icon: LogOut, subKey: "employees" },
        ]},
        { label: "التوظيف والتعيين", path: "/hr/recruitment", icon: Briefcase, children: [
          { label: "التوظيف والاستقطاب", path: "/hr/recruitment", icon: Briefcase, subKey: "recruitment" },
          { label: "المتقدمين", path: "/hr/recruitment/applications", icon: Users2, subKey: "recruitment" },
          { label: "تفعيل الموظفين", path: "/hr/employee-activation", icon: UserPlus, subKey: "employees" },
          { label: "لوحة قيد التفعيل", path: "/hr/activation-board", icon: ListChecks, subKey: "employees" },
          { label: "مراجعة التعيين", path: "/hr/onboarding-review", icon: ClipboardCheck, subKey: "employees" },
          { label: "طلبات استكمال البيانات", path: "/hr/self-onboarding-review", icon: ClipboardCheck, subKey: "employees" },
        ]},

        // 3. النشاط والحضور — gathers shifts + attendance + tracking
        // (previously 2 separate top-level entries)
        { label: "النشاط والحضور", path: "/hr/attendance", icon: Clock, children: [
          { label: "الحضور والانصراف", path: "/hr/attendance", icon: Clock, subKey: "attendance" },
          // HR-REV-2 §4.6 — «تقارير الحضور» تعيش في مجموعة «التقارير» الموحّدة
          // (التي صُمِّمت لتجميع تقارير الحضور/الأداء/الرواتب)؛ أُزيل المكرّر هنا.
          { label: "التتبع الحي (الميداني)", path: "/hr/attendance/field-tracking", icon: MapPin, subKey: "attendance" },
          { label: "سياسات التتبع", path: "/hr/attendance/tracking-policies", icon: ShieldCheck, subKey: "attendance" },
          { label: "تسجيل بالرمز المصوّر", path: "/hr/attendance/qr-scanner", icon: QrCode, subKey: "attendance" },
          { label: "جدول الورديات", path: "/hr/shifts", icon: CalendarClock, subKey: "shifts" },
          // HR-REV — أُزيل «إدارة الورديات» المكرّر: /hr/shifts/management يرتدّ إلى
          // /hr/shifts، ونموذج إسناد الموظف صار تبويب «التعيينات» في الصفحة نفسها.
        ]},

        // 4. الطلبات — single inbox for leaves/OT/excuses + the new
        // Services Catalog landing
        { label: "الطلبات", path: "/hr/services", icon: ClipboardCheck, children: [
          { label: "خدمات الموارد البشرية", path: "/hr/services", icon: ClipboardCheck, subKey: "services" },
          { label: "صندوق موافقات الموارد البشرية", path: "/hr/approvals", icon: Bell, subKey: "leaves" },
          { label: "طلبات الإجازة", path: "/hr/leaves", icon: Calendar, subKey: "leaves" },
          { label: "الوقت الإضافي", path: "/hr/overtime", icon: Timer, subKey: "attendance" },
          { label: "طلبات الاستئذان", path: "/hr/excuse-requests", icon: ClipboardCheck, subKey: "attendance" },
          { label: "سلاسل الموافقات", path: "/hr/leaves/approval-chains", icon: GitBranch, subKey: "leaves" },
        ]},

        // 5. الامتثال والجزاءات — gathers all violations + memos +
        // regulations + Saudization (previously 3 separate clusters).
        // PR-10 (#2077) — Closure Gate: explicit perm guard on the
        // group + the discipline/violations children so the رابط لا يظهر
        // for users without violations/discipline visibility (e.g.
        // payroll_officer). Backend authorize() still 403s either way —
        // this just keeps «نظهرَ ثم 403» out of the UX. السعودة + WPS
        // children stay on their own permissions so finance/payroll
        // personas can still reach them.
        { label: "المخالفات والجزاءات", path: "/hr/violations", icon: Scale,
          perm: ["hr.violations:view", "hr.violations:list", "hr.discipline:view", "hr.discipline:list"], permMode: "any",
          children: [
          // HR-REV-7 (#2226) — توحيد المخالفات: /hr/violations (المبوّبة، canonical)
          // هي المدخل الوحيد. صفحة «إدارة المخالفات» (/hr/violations/management) صار
          // محتواها (قائمة المخالفات الخام + الاعتماد + التحليل) تبويب «المخالفات الخام»
          // داخل violations.tsx، والصفحة الميتة أُزيلت (retire) والمسار يُعاد توجيهه.
          { label: "نظرة عامة على المخالفات", path: "/hr/violations", icon: ListChecks, subKey: "violations", perm: ["hr.violations:view","hr.violations:list"], permMode: "any" },
          { label: "المحاضر التأديبية", path: "/hr/violations?tab=memos", icon: FileText, subKey: "violations", perm: ["hr.discipline:view","hr.discipline:list"], permMode: "any" },
          { label: "الرصد التلقائي", path: "/hr/violations/auto-detection", icon: Radar, subKey: "violations", perm: ["hr.violations:view","hr.violations:list"], permMode: "any" },
          { label: "تصعيد العقوبات", path: "/hr/violations/penalty-escalation", icon: TrendingUp, subKey: "violations", perm: ["hr.discipline:view","hr.discipline:list"], permMode: "any" },
          { label: "لائحة الانضباط", path: "/hr/discipline/regulation", icon: ScrollText, subKey: "violations", perm: ["hr.discipline:view","hr.discipline:list"], permMode: "any" },
          { label: "السعودة (نطاقات)", path: "/hr/saudization", icon: Flag, subKey: "employees", perm: ["hr.saudization:view","hr.saudization:list"], permMode: "any" },
          { label: "حماية الأجور / مدد / البنوك", path: "/hr/saudi-compliance", icon: Flag, subKey: "payroll", perm: ["hr.payroll.wps:view","hr.payroll.wps:list"], permMode: "any" },
          { label: "إعدادات حماية الأجور", path: "/hr/saudi-compliance/wps/settings", icon: Settings, subKey: "payroll", perm: ["hr.payroll.wps:view","hr.payroll.wps:list"], permMode: "any" },
        ]},

        // 6. الأداء والتطوير — gathers performance + 360 + IDP + training
        // (previously 2 separate top-level entries)
        { label: "الأداء والتطوير", path: "/hr/performance", icon: Target, children: [
          { label: "تقييم الأداء", path: "/hr/performance", icon: Target, subKey: "performance" },
          { label: "التقييم 360°", path: "/hr/evaluation-360", icon: Activity, subKey: "performance" },
          { label: "خطط التطوير الفردية", path: "/hr/idp", icon: BookOpen, subKey: "performance" },
          { label: "البرامج التدريبية", path: "/hr/training", icon: GraduationCap, subKey: "training" },
          // HR-REV — أُزيل «التقييم المتقدم» و«التدريب المتقدم» المكرّران: مساراهما
          // (/hr/performance/advanced و/hr/training/advanced) يرتدّان للصفحة الأم،
          // وتحليلاتهما صارت تبويب «التحليلات» / قسم «البرامج حسب الحالة» داخلها.
        ]},

        // 7. الرواتب — payroll + components + loans + EOS + accruals + WPS
        { label: "الرواتب والمستحقات", path: "/hr/payroll", icon: DollarSign, children: [
          { label: "مسيرات الرواتب", path: "/hr/payroll", icon: DollarSign, subKey: "payroll" },
          { label: "مكونات الرواتب", path: "/hr/payroll/salary-components", icon: Percent, subKey: "payroll" },
          { label: "معدّلات أجر السائق", path: "/hr/driver-pay-rates", icon: Percent, subKey: "payroll", perm: "hr.driver_pay:list" },
          { label: "مستحقّات قيد الترحيل", path: "/hr/payroll/pending-dues", icon: Coins, subKey: "payroll", perm: "hr.payroll.runs:view" },
          { label: "سلف الموظفين", path: "/hr/loans", icon: Wallet, subKey: "payroll" },
          { label: "مكافأة نهاية الخدمة", path: "/hr/gratuity", icon: Banknote, subKey: "payroll" },
          { label: "الاستحقاقات الشهرية", path: "/hr/accruals", icon: ListChecks, subKey: "payroll" },
          { label: "نظام حماية الأجور", path: "/hr/wps", icon: Send, subKey: "payroll" },
        ]},

        // 8. التقارير — single entry, surfaces reports that lived under
        // attendance/performance/payroll clusters
        { label: "التقارير", path: "/hr/turnover-report", icon: FileBarChart, children: [
          { label: "تقرير الدوران", path: "/hr/turnover-report", icon: FileBarChart, subKey: "performance" },
          { label: "تقارير الحضور", path: "/hr/attendance/reports", icon: BarChart3, subKey: "attendance" },
          // HR-REV — أُزيل «تحليلات التوظيف المتقدمة» المكرّر: /hr/recruitment/advanced
          // يرتدّ إلى /hr/recruitment (مدخل «وظائف التوظيف») التي تشمله بالكامل.
        ]},

        // 9. الإعدادات — attendance policy + holidays
        { label: "إعدادات الموارد البشرية", path: "/hr/attendance-policy", icon: Settings, children: [
          { label: "سياسة الحضور", path: "/hr/attendance-policy", icon: Settings, subKey: "attendance" },
          { label: "الإجازات الرسمية", path: "/hr/public-holidays", icon: CalendarClock, subKey: "leaves" },
          // /admin/org-model + /admin/org-memberships removed from the sidebar:
          // the legal_entities/positions/teams overlay (migration 274) is a parallel
          // org model consumed nowhere outside org.ts — the load-bearing structure is
          // companies/branches/departments (settings). Kept URL-reachable (off-sidebar)
          // because hr/org-tree still links org-memberships for team/committee CRUD.
          { label: "أوزان التقييم وترتيب الأداء", path: "/hr/scoring-weights", icon: TrendingUp, subKey: "performance" },
          { label: "فئات الموظفين وسياسات الحضور", path: "/hr/attendance-categories", icon: Users, subKey: "attendance" },
        ]},
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 4. المالية والمحاسبة
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "المالية والمحاسبة",
    items: [
      // إدارة المالية والمحاسبة — مدخل وحدة واحد يجمع مجموعات المالية الفرعية (نفس نمط
      // «إدارة الأسطول»/«إدارة العمرة»). كانت 19 مجموعة مسطّحة، فأُعيد تجميعها تحت
      // مدخل واحد. إعادة تجميع فقط — module:"finance" انتقل إلى المدخل الأب.
      { label: "إدارة المالية والمحاسبة", path: "/finance", icon: BarChart3, module: "finance", children: [
        // #1715 موجة 6 — تصنيف المالية إلى 13 مجموعة حسب دورة العمل. المجموعات
        // حاويات فقط: لم يتغيّر أو يُحذف أي مسار، فلا أيتام ولا روابط ميتة،
        // والإعدادات آخراً، والتقارير مجمَّعة.
        // (1) اللوحات والإقفال — اللوحات الخمس الإفرادية مجمَّعة في مدخل واحد.
        { label: "اللوحات والإقفال", path: "/finance", icon: BarChart3, children: [
          { label: "لوحة المالية", path: "/finance", icon: BarChart3 },
          { label: "مركز سير العمل المالي", path: "/finance/workflows-hub", icon: Sparkles },
          { label: "لوحة المدير المالي", path: "/finance/cfo-cockpit", icon: BarChart3 },
          { label: "فحص الإغلاق اليومي", path: "/finance/daily-close-checklist", icon: ListChecks },
          { label: "حزمة الإقفال الشهري", path: "/finance/monthly-close-pack", icon: FileBarChart },
          { label: "إطفاء المصروفات المقدمة", path: "/finance/amortization", icon: CalendarClock },
          { label: "الإيراد المؤجل", path: "/finance/deferred-revenue", icon: TrendingUp },
          { label: "تسجيل قسط تأمين", path: "/finance/insurance", icon: ShieldCheck },
        ]},
        // (2) الحسابات والقيود
        // F-2 (FINANCE_INVENTORY_AND_ORGANIZATION §4.أ②) — فُكّت «الحسابات والقيود»
        // (20 مدخلاً) إلى مجموعتين: الحسابات/مراكز التكلفة، والقيود/الترحيل. إعادة
        // تجميع فقط — لم يتغيّر أي مسار/صلاحية/تسمية ابن.
        { label: "الحسابات ومراكز التكلفة", path: "/finance/accounts", icon: GitBranch, children: [
          { label: "شجرة الحسابات", path: "/finance/accounts", icon: GitBranch },
          { label: "فجوات تصنيف الحسابات", path: "/finance/usage-gaps", icon: ShieldAlert },
          { label: "حسابات فرعية", path: "/finance/subsidiary-accounts", icon: Layers },
          { label: "مراكز التكلفة", path: "/finance/cost-centers", icon: Network },
          { label: "شجرة مراكز التكلفة", path: "/finance/cost-centers/tree", icon: Network },
          { label: "ترتيب مراكز التكلفة", path: "/finance/cost-centers/ranking", icon: BarChart3 },
          { label: "كشف الحساب التحليلي", path: "/finance/entity-statements", icon: FileText },
          { label: "أرصدة افتتاحية", path: "/finance/opening-balances", icon: FilePlus, minRoleLevel: 70 },
        ]},
        { label: "القيود والترحيل", path: "/finance/journal", icon: ScrollText, children: [
          { label: "القيود اليومية", path: "/finance/journal", icon: ScrollText },
          { label: "ميزان مع تتبّع", path: "/finance/trial-balance-drilldown", icon: Scale },
          { label: "مقارنة ميزان", path: "/finance/trial-balance-comparison", icon: BarChart3 },
          { label: "كاشف الشذوذ", path: "/finance/gl-anomaly-detector", icon: ShieldAlert },
          { label: "طابور الترحيل", path: "/finance/gl-posting-queue", icon: Clock },
          { label: "مركز التسويات", path: "/finance/reconciliation-hub", icon: RefreshCw },
          { label: "القيود اليدوية", path: "/finance/journal-manual", icon: FileSignature, minRoleLevel: 70 },
          { label: "قوالب القيود", path: "/finance/journal-templates", icon: FileText },
          { label: "معالج عكس قيد", path: "/finance/journal/reverse", icon: ArrowLeftRight },
          { label: "قيود دورية", path: "/finance/recurring-journals", icon: CalendarClock },
          { label: "تقويم الدورية", path: "/finance/recurring-calendar", icon: Calendar },
        ]},
        { label: "الفواتير والسندات", path: "/finance/invoices", icon: Receipt, children: [
          // الإدخال الموحّد — «تسجيل واقعة مالية» (قبض/صرف · مبيعات · مشتريات في صفحة
          // واحدة بتبويبات). المدخل الأساسي للإنشاء المالي، ظاهر في القائمة لا مخفيًّا
          // خلف أزرار القوائم فقط. يستخدم مسار «record-event» الودود (نظير «تسجيل واقعة
          // مركبة» /fleet/record-event) لا /create — احترامًا لحارس «لا إنشاء في القائمة».
          { label: "تسجيل واقعة مالية", path: "/finance/record-event", icon: ClipboardCheck },
          { label: "الفواتير", path: "/finance/invoices", icon: Receipt },
          { label: "فواتير متكررة", path: "/finance/recurring-invoices", icon: CalendarClock },
          { label: "صف الإرسال", path: "/finance/invoice-send-queue", icon: Send },
          { label: "السندات", path: "/finance/vouchers", icon: FileText },
          { label: "المصروفات", path: "/finance/expenses", icon: Wallet },
          { label: "اعتماد مصاريف بالجملة", path: "/finance/expense-bulk-approvals", icon: CheckSquare },
          { label: "موزّع التكاليف", path: "/finance/expenses/split", icon: Layers },
          { label: "تحويل بين الحسابات", path: "/finance/treasury/transfer", icon: ArrowLeftRight },
          { label: "النقد في الطريق", path: "/finance/cash-in-transit", icon: Banknote },
          { label: "المقبوضات", path: "/finance/receivables", icon: DollarSign },
          { label: "تحصيل من عميل (مطابقة تلقائية)", path: "/finance/collect", icon: DollarSign },
          { label: "المدفوعات", path: "/finance/payments", icon: Wallet },
          { label: "دفعات مقدمة من العملاء", path: "/finance/customer-advances", icon: ArrowLeftRight },
          { label: "منضدة دفعات العملاء المقدمة", path: "/finance/customer-advances-workbench", icon: Briefcase },
        ]},
        { label: "المشتريات والموردين", path: "/finance/purchase-orders", icon: ShoppingCart, children: [
          { label: "طلبات الشراء", path: "/finance/purchase-requests", icon: ClipboardList },
          { label: "أوامر الشراء", path: "/finance/purchase-orders", icon: ShoppingCart },
          { label: "الموردون", path: "/finance/vendors", icon: Users },
          { label: "مستندات الموردين", path: "/finance/vendor-documents", icon: FileText },
          { label: "منضدة التسوية", path: "/finance/vendor-settlement-workbench", icon: Briefcase },
          { label: "كشف حساب مورد للطباعة", path: "/finance/vendor-statement-print", icon: Printer },
          { label: "ملف المورد 360°", path: "/finance/vendor-360-sheet", icon: Users },
          { label: "إنفاق الموردين", path: "/finance/vendor-spend", icon: BarChart3 },
          { label: "دفعة الدفع", path: "/finance/payment-run", icon: Banknote },
          { label: "تقويم الدفعات", path: "/finance/ap-payment-calendar", icon: Calendar },
          { label: "عقود الموردين", path: "/finance/contracts", icon: FileSignature },
          { label: "متابعة عقود الموردين", path: "/finance/vendor-contracts-tracker", icon: FileSignature },
        ]},
        { label: "النقد والخزينة", path: "/finance/treasury", icon: Building, children: [
          { label: "مراقبة البنوك", path: "/finance/bank-accounts-watch", icon: Banknote },
          { label: "الخزينة", path: "/finance/treasury", icon: Wallet },
          { label: "التسوية البنكية", path: "/finance/bank-reconciliation", icon: Building },
          { label: "ورقة عمل تسوية حساب", path: "/finance/account-recon-workpaper", icon: FileSignature },
          { label: "لوحة التدفق النقدي", path: "/finance/cashflow", icon: LineChart },
          { label: "توقعات التدفق النقدي", path: "/finance/cash-flow-forecast", icon: TrendingUp },
          { label: "تقويم النقدية", path: "/finance/cash-calendar", icon: Calendar },
          { label: "توقعات النقد (13 أسبوع)", path: "/finance/cash-13week", icon: TrendingUp },
          { label: "حاسبة الوضع النقدي", path: "/finance/cash-position-calculator", icon: Calculator },
        ]},
        { label: "الذمم والعملاء", path: "/finance/customer-statement-print", icon: Users, children: [
          { label: "كشف حساب عميل للطباعة", path: "/finance/customer-statement-print", icon: Printer },
          { label: "ملف العميل 360°", path: "/finance/customer-360-sheet", icon: Users },
          { label: "مخاطر العملاء", path: "/finance/customer-risk", icon: AlertTriangle },
          { label: "ورقة عمل مخصص الديون", path: "/finance/bad-debt-provision", icon: TrendingUp },
          { label: "تقادم الذمم الدائنة", path: "/finance/ap-aging", icon: Clock },
        ]},
        { label: "الأصول والعهد", path: "/finance/fixed-assets", icon: Building2, children: [
          { label: "الأصول الثابتة", path: "/finance/fixed-assets", icon: Building2 },
          { label: "سجل الأصول الثابتة", path: "/finance/fixed-asset-register", icon: BarChart3 },
          { label: "إهلاك دفعة واحدة", path: "/finance/fixed-assets/batch-depreciate", icon: TrendingUp },
          { label: "الأعمال الرأسمالية تحت التنفيذ", path: "/finance/cip", icon: Building2 },
          { label: "العهد", path: "/finance/custodies", icon: KeyRound },
          { label: "منضدة العُهد", path: "/finance/custody-workbench", icon: KeyRound },
          { label: "تقرير العهد", path: "/finance/custodies/report", icon: FileBarChart },
        ]},
        // (7) الموازنة والفترات والالتزامات — دمج «الفترات والميزانية» مع
        // «الالتزامات والضمانات» في مجموعة دورة موازنة واحدة.
        { label: "الموازنة والفترات والالتزامات", path: "/finance/budget", icon: FileBarChart, children: [
          { label: "الميزانية", path: "/finance/budget", icon: FileBarChart },
          { label: "خريطة حرارية", path: "/finance/budget-heatmap", icon: BarChart3 },
          // مدخل واحد للفترات المالية → الصفحة v2 (تُنشئ/تعرض/تُقفل/تقفل نهائيًّا).
          // أُزيل المدخل المكرّر «الفترات المالية» الذي كان يرتدّ لنفس v2 (صفحة v1
          // مُقاعَدة)، وأُبقي بوّابة الصلاحية. /finance/fiscal-periods يبقى redirect.
          { label: "الفترات المالية", path: "/finance/fiscal-periods-v2", icon: Calendar, minRoleLevel: 70 },
          { label: "فحص قبل الإقفال", path: "/finance/period-close-preflight", icon: ShieldAlert, minRoleLevel: 70 },
          { label: "إقفال السنة المالية", path: "/finance/year-end-close", icon: Archive, minRoleLevel: 70 },
          { label: "الالتزامات", path: "/finance/commitments", icon: FileSignature },
          { label: "الضمانات البنكية", path: "/finance/bank-guarantees", icon: Shield },
        ]},
        // (8) التكاليف والتسويات
        { label: "التكاليف والتسويات", path: "/finance/project-costing", icon: FolderOpen, children: [
          { label: "تكاليف المشاريع", path: "/finance/project-costing", icon: FolderOpen },
          { label: "محفظة المركبات", path: "/finance/vehicle-portfolio", icon: BarChart3 },
          { label: "قائمة الدخل حسب مركز التكلفة", path: "/finance/cost-center-pnl", icon: BarChart3 },
          { label: "تقييم المخزون (المتوسط المرجح)", path: "/finance/inventory-costing", icon: Package },
          { label: "المعاملات البينية", path: "/finance/intercompany", icon: ArrowLeftRight },
        ]},
        // F-1 (FINANCE_INVENTORY_AND_ORGANIZATION §4.أ①) — فُكّت مجموعة «الضرائب
        // والتقارير» المتضخّمة (34 مدخلاً تخلط الضرائب بالتقارير) إلى مجموعتين:
        // الضرائب/الزكاة، والتقارير/التحليلات. إعادة تجميع فقط — لم يتغيّر أي مسار
        // أو صلاحية أو تسمية ابن (بوّابة check-sidebar-coverage تبقى خضراء).
        { label: "الزكاة والضريبة", path: "/finance/tax", icon: Scale, children: [
          { label: "نظام الضرائب", path: "/finance/tax", icon: Scale },
          { label: "رموز الضريبة", path: "/finance/tax-codes", icon: Percent },
          { label: "قواعد التسعير", path: "/finance/pricing-rules", icon: Percent },
          { label: "فئات ضريبة الاستقطاع", path: "/finance/wht-categories", icon: Percent },
          { label: "تقويم الإقرارات", path: "/finance/tax-filing-calendar", icon: Calendar },
          { label: "جاهزية إقرار ضريبة القيمة المضافة", path: "/finance/vat-filing-readiness", icon: FileCheck },
          { label: "مركز تقارير الزكاة والضريبة", path: "/finance/reports/zatca", icon: FileCheck },
          { label: "فواتير الأفراد موجَّهة خطأ", path: "/finance/zatca/misrouted", icon: ShieldAlert },
          { label: "عملاء بلا رقم ضريبي", path: "/finance/zatca/missing-tax", icon: AlertTriangle },
          { label: "تسوية ضريبة القيمة المضافة", path: "/finance/reports/vat-reconciliation", icon: Scale },
          { label: "ملخص ضريبة الاستقطاع", path: "/finance/reports/wht-summary", icon: Percent },
          { label: "إعداد إقرار ضريبة الاستقطاع", path: "/finance/wht-filing-workbench", icon: FileCheck },
        ]},
        { label: "القوائم المالية", path: "/finance/reports", icon: FileBarChart, children: [
          { label: "التقارير المالية", path: "/finance/reports", icon: FileBarChart },
          { label: "قائمة الدخل مقابل الميزانية", path: "/finance/reports/is-vs-budget", icon: Scale },
          { label: "اتجاه قائمة الدخل", path: "/finance/reports/is-trend", icon: TrendingUp },
          { label: "قائمة التدفقات النقدية", path: "/finance/reports/cash-flow-statement", icon: Banknote },
          { label: "المقارنة السنوية (سنة/سنة)", path: "/finance/reports/yoy", icon: BarChart2 },
        ]},
        { label: "تقارير الربحية والمحافظ", path: "/finance/expense-burn-rate", icon: TrendingUp, children: [
          { label: "معدل الحرق", path: "/finance/expense-burn-rate", icon: Activity },
          { label: "مؤشر صحة النظام المالي", path: "/finance/gl-health", icon: ShieldAlert },
          { label: "محفظة ربحية المشاريع", path: "/finance/project-portfolio", icon: BarChart2 },
          { label: "محفظة ربحية العقارات", path: "/finance/property-portfolio", icon: BarChart2 },
          { label: "محفظة ربحية وكلاء العمرة", path: "/finance/umrah-agent-portfolio", icon: BarChart2 },
          { label: "محفظة مجموعات العمرة", path: "/finance/umrah-group-portfolio", icon: BarChart2 },
          { label: "محفظة مواسم العمرة", path: "/finance/umrah-season-portfolio", icon: BarChart2 },
          { label: "محلّل مزيج الإيرادات", path: "/finance/revenue-mix", icon: TrendingUp },
          { label: "محلّل مزيج المصاريف", path: "/finance/expense-mix", icon: TrendingUp },
        ]},
        { label: "تقارير المخزون والتكلفة", path: "/finance/reports/cogs-summary", icon: Package, children: [
          { label: "ملخص تكلفة المبيعات", path: "/finance/reports/cogs-summary", icon: TrendingDown2 },
          { label: "تقرير تقييم المخزون", path: "/finance/reports/inventory-valuation", icon: Package },
          { label: "دوران المخزون", path: "/finance/reports/inventory-turnover", icon: RefreshCw },
          { label: "تنبيهات صلاحية الدفعات", path: "/finance/reports/lot-expiry-alerts", icon: AlertTriangle },
          { label: "مخزون سالب", path: "/finance/reports/negative-stock", icon: AlertTriangle },
        ]},
        { label: "تقارير الذمم والموازنة", path: "/finance/reports/dso-trend", icon: BarChart3, children: [
          { label: "اتجاه فترة التحصيل", path: "/finance/reports/dso-trend", icon: Activity },
          { label: "انحرافات الميزانية", path: "/finance/budget-variance", icon: BarChart3 },
          { label: "اعتماد الميزانية", path: "/finance/budget-approvals", icon: ClipboardCheck },
        ]},
        // (10) الصناديق والارتباطات — دمج «صناديق الواردات» مع «ارتباطات الموظفين».
        { label: "الصناديق والارتباطات", path: "/finance/intake", icon: Bell, children: [
          { label: "مركز التلقّي المالي", path: "/finance/intake", icon: Truck },
          { label: "صندوق الموافقات الموحّد", path: "/finance/approvals-inbox", icon: Bell },
          { label: "ملف الجهة 360°", path: "/finance/entity-360", icon: Sparkles },
          { label: "ترتيب الجهات", path: "/finance/entity-ranking", icon: BarChart3 },
          { label: "الجهات الخاملة", path: "/finance/dormant-entities", icon: Clock },
          { label: "صدق دفتر الأستاذ (قياس)", path: "/finance/reports/ledger-truth", icon: AlertTriangle },
          { label: "فجوات سلامة دفتر الأستاذ", path: "/finance/reports/gl-integrity-gaps", icon: AlertTriangle },
          { label: "فجوات العمليات المالية", path: "/finance/reports/operation-gaps", icon: AlertTriangle },
          { label: "البنود غير المُوجَّهة", path: "/finance/reports/unmapped-lines", icon: AlertTriangle },
          { label: "نشاط الترحيل المحاسبي", path: "/finance/journal/activity", icon: Activity },
          { label: "سلف الرواتب", path: "/finance/salary-advances", icon: DollarSign },
          { label: "الطلبات المالية", path: "/finance/financial-requests", icon: ClipboardCheck },
        ]},
        // (11) التحصيل والديون
        // F6 (audit) — التحصيل والديون المعدومة كانت موجودة كصفحات لكن غير
        // مرتبطة بالـsidebar؛ مجمَّعة هنا الآن في مدخل واحد لتسهيل الوصول.
        { label: "التحصيل والديون", path: "/finance/collections", icon: AlertTriangle, children: [
          { label: "منضدة التحصيل", path: "/finance/ar-collection-workbench", icon: DollarSign },
          { label: "تقادم الذمم المدينة", path: "/finance/ar-aging", icon: Clock },
          { label: "متابعة التحصيل", path: "/finance/dunning", icon: Bell },
          { label: "مراحل التصعيد", path: "/finance/collection", icon: AlertTriangle },
          { label: "مخصص الديون المشكوك فيها", path: "/finance/bad-debt", icon: ShieldAlert },
        ]},
        // F6 (audit) — العملات الأجنبية: rates + revaluation + history في
        // مجموعة واحدة بدلاً من تركها كلها off-sidebar.
        { label: "العملات الأجنبية", path: "/finance/fx-rates", icon: Globe, children: [
          { label: "أسعار الصرف", path: "/finance/fx-rates", icon: Globe },
          { label: "إعادة التقييم", path: "/finance/fx-revaluation", icon: RefreshCw },
          { label: "سجل إعادة التقييم", path: "/finance/fx-revaluation/history", icon: Activity },
        ]},
        // محرك التوجيه المحاسبي (الإعدادات) — مُبقاة في آخر مجموعة المالية
        // اتساقاً مع معيار #1715 «الإعدادات في آخر القائمة». صفحات Line-Level
        // Allocation cluster (PRs 1291, 1297, 1304, 1307, 1309, 1311) مترابطة
        // عبر AllocationTabsNav و AllocationHealthCard، وهذا المدخل يخلي الكلستر
        // قابلاً للوصول من أي صفحة في النظام (ليس من finance فقط).
        { label: "محرك التوجيه المحاسبي", path: "/finance/settings", icon: Network, children: [
          { label: "مركز الإعدادات", path: "/finance/settings", icon: Settings },
          { label: "قواعد التوجيه", path: "/finance/allocation-rules", icon: Network },
          { label: "التوجيه البُعدي", path: "/finance/dimensional-routing", icon: Network },
          { label: "كتالوج المنتجات", path: "/finance/product-catalog", icon: Package },
          { label: "تشخيص التغطية", path: "/finance/allocation-coverage", icon: Target },
          { label: "سجل التوجيه", path: "/finance/allocation-results", icon: Activity },
          { label: "مركز التصنيف", path: "/finance/classification-center", icon: Layers },
          { label: "فشل الحسابات الفرعية", path: "/finance/subsidiary-account-failures", icon: ShieldAlert },
          { label: "تشخيص أبوّة الحسابات", path: "/finance/datafix/misparented-subsidiaries", icon: GitBranch },
          { label: "التعديلات اليدوية", path: "/finance/overrides-report", icon: BookOpen },
          { label: "تجاوزات الإلزام", path: "/finance/allocation-override-log", icon: ShieldAlert },
        ]},
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 5. العمليات
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "المشاريع",
    items: [
      { label: "المشاريع والمهام", path: "/projects", icon: Activity, module: "operations", children: [
        { label: "قائمة المشاريع", path: "/projects?tab=list", icon: Target },
        { label: "مخطط غانت", path: "/projects/gantt", icon: BarChart2 },
        { label: "مخاطر المشاريع", path: "/projects/risks", icon: ShieldAlert },
        // "مهام المشاريع" → /projects/tasks removed: it rendered the GENERAL
        // operations Tasks page (the `tasks` table), mislabelling operations work
        // as project tasks. Per-project tasks (project_tasks) live in the project
        // detail page; general operations tasks live at /tasks (below).
        { label: "المهام", path: "/tasks", icon: ListTodo },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 6. الأسطول والنقل
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الأسطول والنقل",
    items: [
      // #2475-follow-up — كانت «إدارة الأسطول» قائمة مسطّحة من 38 مدخلاً
      // (سائق + مركبات + صيانة + تتبّع + نقل + تقارير + قواعد) بلا تجميع،
      // على عكس «الموارد البشرية» (#1799) و«المالية» (#1715) و«مدير النظام».
      // أُعيد تنظيمها هنا إلى مجموعات فرعية موضوعية بنفس نمط «مدير النظام»:
      // لا يُحذف ولا يُنقل أي مسار — فقط التجميع تغيّر (لا أيتام ولا روابط
      // ميتة، وبوّابة check-sidebar-coverage تبقى خضراء). الترتيب: التشغيل
      // اليومي أولاً ثم التقارير ثم القواعد/الإعدادات آخراً.
      { label: "إدارة الأسطول", path: "/fleet", icon: Truck, module: "fleet", children: [
        // 1) اللوحات والسائق — نقاط الدخول العامة + الخدمة الذاتية للسائق.
        { label: "اللوحات والسائق", path: "/module-dashboards?tab=fleet", icon: LayoutDashboard, children: [
          // PR-1 / #2163 — this dashboard is gated to the fleet module and now
          // agrees with the backend (it was previously mis-attributed to BI).
          // NB: keep this comment free of the literal module-colon-"bi" string —
          // platformWave2Pr1…DecouplingSmoke regex-scans this file and a
          // /module-dashboards group-parent puts the comment inside its match span.
          { label: "لوحة التحكم", path: "/module-dashboards?tab=fleet", icon: LayoutDashboard, module: "fleet" },
          // Driver self-service home. Gated by the fleet MODULE (not a fine perm):
          // the backend grants `fleet.driver.me` to the driver role, but that grant
          // is NOT surfaced in /permissions/my (which feeds can()), so a perm gate
          // would wrongly hide this from the very role that needs it. Module-gating
          // shows it to anyone with fleet access; non-driver managers who click it
          // hit a graceful "لا يوجد سجل سائق" empty state, never an error.
          { label: "لوحة السائق", path: "/me/driver", icon: User, module: "fleet" },
          // ملاحة السائق — نفس بوابة لوحة السائق (module بدل perm) ولنفس السبب.
          { label: "ملاحة السائق", path: "/me/driver/navigation", icon: Navigation, module: "fleet" },
        ]},
        // 2) المركبات والتشغيل — الأصول وتشغيلها اليومي.
        // Management children are gated by the exact backend feature:action each
        // page requires, so a role lacking the grant (e.g. driver) never sees a
        // link that would 403 into "حدث خطأ في تحميل البيانات". Owner bypasses
        // via can() (isOwnerRole), so the owner still sees every link.
        { label: "المركبات والتشغيل", path: "/fleet", icon: Car, children: [
          // المركبات — قائمة الأسطول (تبويب المركبات في /fleet) وبها زر «إضافة مركبة».
          // أُعيدت بعد سقوطها من المجموعة في إعادة تنظيم الأسطول، إذ اختفت قائمة
          // المركبات وزر الإضافة من القائمة رغم بقاء الصفحة قائمةً تعمل.
          { label: "المركبات", path: "/fleet", icon: Car, perm: "fleet.vehicles:list" },
          // البند ٤ — «تسجيل واقعة مركبة» الموحّدة (الكيان يقود: وقود/صيانة/تأمين معًا).
          { label: "تسجيل واقعة مركبة", path: "/fleet/record-event", icon: ClipboardCheck, perm: "fleet.vehicles:update" },
          { label: "السائقين", path: "/fleet/drivers", icon: User, perm: "fleet.vehicles:list" },
          { label: "ساعات عمل السائق", path: "/fleet/driver-work-hours", icon: Clock, perm: "fleet.driver_hours:list" },
          { label: "مكافآت حركات النقل", path: "/fleet/movement-bonuses", icon: Award, perm: "fleet.movement_bonus:list" },
          { label: "فحوص المركبات", path: "/fleet/inspections", icon: ClipboardCheck, perm: "fleet.vehicles:list" },
          { label: "الرحلات", path: "/fleet/trips", icon: Navigation, perm: "fleet.trips:list" },
          { label: "استهلاك الوقود", path: "/fleet/fuel", icon: Fuel, perm: "fleet.trips:list" },
          { label: "التأمين", path: "/fleet/insurance", icon: Shield, perm: "fleet.vehicles:list" },
          // تأجير المركبات — صفحة العقود.
          // #2079 TA-T18-09 — هاجرت إلى fleet.rentals كميزة مستقلة (كانت
          // تحت fleet.vehicles؛ الـPERM-02 طلب فصلها كي يُمنح موظف تأجير
          // الصلاحية دون فتح CRUD كامل للمركبات).
          { label: "تأجير المركبات", path: "/fleet/rental-contracts", icon: FileSignature, perm: "fleet.rentals:list" },
          { label: "مخالفات المرور", path: "/fleet/traffic-violations", icon: AlertTriangle, perm: "fleet.vehicles:list" },
          { label: "التنبيهات", path: "/fleet/alerts", icon: Bell, perm: "fleet.vehicles:list" },
          { label: "الشحن والبضائع", path: "/fleet/cargo", icon: Package, perm: "fleet.cargo:list" },
        ]},
        // 3) الصيانة والإطارات.
        { label: "الصيانة والإطارات", path: "/fleet/maintenance", icon: Wrench, children: [
          { label: "الصيانة", path: "/fleet/maintenance", icon: Wrench, perm: "fleet.maintenance:list" },
          { label: "أثر الصيانة → التذاكر", path: "/fleet/maintenance-impact", icon: AlertTriangle, perm: "fleet.maintenance:list" },
          { label: "خطط الصيانة الوقائية", path: "/fleet/preventive-plans", icon: CalendarClock, perm: "fleet.maintenance:list" },
          { label: "الإطارات", path: "/fleet/tires", icon: Settings, perm: "fleet.maintenance:list" },
        ]},
        // 4) التتبع (Telematics) — المركز + الخريطة الحيّة والأجهزة والأدلة.
        { label: "التتبع", path: "/fleet/telematics", icon: Satellite, children: [
          { label: "نظام التتبع", path: "/fleet/telematics", icon: Satellite, perm: "fleet.telematics.live:list" },
          { label: "التتبع المباشر", path: "/fleet/telematics/live-map", icon: Satellite, perm: "fleet.telematics.live:list" },
          { label: "تنبيهات السلامة الذكية", path: "/fleet/telematics/ai-alerts", icon: Bot, perm: "fleet.telematics.ai_alerts:list" },
          { label: "بطاقة أداء السائقين", path: "/fleet/telematics/scorecard", icon: Award, perm: "fleet.telematics.ai_alerts:list" },
          { label: "قراءات الحساسات", path: "/fleet/telematics/sensors", icon: Activity, perm: "fleet.telematics.sensors:list" },
          { label: "أرشيف الأدلة", path: "/fleet/telematics/evidence", icon: Archive, perm: "fleet.telematics.ai_alerts:list" },
          { label: "أدلة الفيديو", path: "/fleet/telematics/video-evidence", icon: VideoIcon, perm: "fleet.telematics.video:list" },
          { label: "أجهزة التسجيل المتنقلة", path: "/fleet/telematics/devices", icon: HardDrive, perm: "fleet.telematics.devices:list" },
          { label: "لوحة التشغيل", path: "/fleet/telematics/operations", icon: ShieldAlert, perm: "fleet.telematics.sync:list" },
          { label: "إعدادات منصة التتبع", path: "/fleet/telematics/settings", icon: Settings, perm: "fleet.telematics.configure:list" },
        ]},
        // 5) النقل والإرسال — دورة الحجز ← الإرسال ← المسارات.
        // النقل والمواصلات (#1812) — كانت هذه الصفحات مركّبة لكن بلا مدخل في
        // القائمة (orphan)؛ بوّاباتها: الحجوزات/القوالب عبر fleet.bookings،
        // والإرسال/المسارات/لوحة العمليات/المُحسِّن عبر fleet.dispatch.
        { label: "النقل والإرسال", path: "/fleet/transport/bookings", icon: Send, children: [
          { label: "حجوزات النقل", path: "/fleet/transport/bookings", icon: ClipboardList, perm: "fleet.bookings:list" },
          { label: "الإرسال", path: "/fleet/transport/dispatch", icon: Send, perm: "fleet.dispatch:list" },
          { label: "خطط المسارات", path: "/fleet/transport/itineraries", icon: Navigation, perm: "fleet.dispatch:list" },
          // TA-T18-VRP Phase 2 — مُحسِّن إسناد الأسطول (Fleet Optimizer batch-mode).
          { label: "مُحسِّن الإسناد", path: "/fleet/optimizer/runs", icon: Calculator, perm: "fleet.dispatch:list" },
          // TR-022 (audit doc file 20 §10) — التقويم الموحَّد التفاعلي.
          { label: "التقويم الموحَّد للنقل", path: "/fleet/transport/calendar", icon: Calendar, perm: "fleet.dispatch:list" },
          // #2079 TA-T18-04 — قوالب الحجوزات المتكررة (cargo recurring).
          { label: "قوالب المسارات المتكررة", path: "/fleet/transport/route-patterns", icon: CalendarClock, perm: "fleet.bookings:list" },
          { label: "لوحة عمليات النقل", path: "/fleet/transport/ops-dashboard", icon: LayoutDashboard, perm: "fleet.dispatch:list" },
          // Control Tower — audit doc file 22 + #1812. One-shot fleet
          // snapshot. Same RBAC scope as ops-dashboard.
          { label: "برج المراقبة", path: "/fleet/transport/control-tower", icon: LayoutDashboard, perm: "fleet.dispatch:list" },
          // كانت orphan: صفحة مركّبة بلا مدخل في القائمة. طابور المحاسب لتسعير
          // وفوترة بنود خدمة النقل — GET /transport/service-lines مبوّب على
          // finance.transport_billing:list (إجراءات التسعير/الفوترة على :approve).
          { label: "طابور تسعير بنود النقل", path: "/fleet/transport/service-lines", icon: Receipt, perm: "finance.transport_billing:list" },
        ]},
        // 6) التقارير والتكاليف.
        { label: "التقارير والتكاليف", path: "/fleet/reports", icon: FileBarChart, children: [
          { label: "التقارير", path: "/fleet/reports", icon: FileBarChart, perm: "fleet.vehicles:list" },
          { label: "إجمالي تكلفة الملكية", path: "/fleet/tco", icon: DollarSign, perm: "fleet.vehicles:list" },
          // TA-GAP-09 Phase 2 — استهلاك واجهة الخرائط (مراقبة حصة Google Maps).
          // الـAPI الخلفية تستخدم fleet.bookings:view؛ هنا نُبقي القائمة مرئية
          // لنفس أدوار التخطيط النقلي.
          { label: "استهلاك الخرائط", path: "/fleet/maps/usage", icon: Activity, perm: "fleet.bookings:list" },
        ]},
        // 7) قواعد النقل والتكامل — الإعدادات آخراً (معيار #1715).
        { label: "قواعد النقل والتكامل", path: "/fleet/transport/price-rules", icon: ListChecks, children: [
          { label: "قواعد تسعير النقل", path: "/fleet/transport/price-rules", icon: Percent, perm: "fleet.bookings:list" },
          { label: "قواعد استقبال النقل", path: "/fleet/transport/rules", icon: ListChecks, perm: "fleet.bookings:list" },
          { label: "تكامل النقل", path: "/fleet/transport/integration", icon: Network, perm: "fleet.bookings:list" },
        ]},
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 7. المستودعات والمتجر
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "المستودعات والمتجر",
    items: [
      { label: "المستودعات", path: "/warehouse", icon: Package, module: "warehouse", children: [
        // #2493-follow-up — كانت «المستودعات» قائمة مسطّحة من 13 مدخلاً.
        // أُعيد تنظيمها إلى لوحة + مجموعات (تشغيل ثم تقارير). إعادة تجميع فقط.
        // Agent-5/PR-1 (#2163): تبقى لوحة التحكم ورقة مستقلة (module: warehouse)
        // مع تعليقها قبلها — كي لا يقع مسار /module-dashboards داخل نطاق فخّ
        // الـregex في platformWave2Pr1…DecouplingSmoke.
        { label: "لوحة التحكم", path: "/module-dashboards?tab=warehouse", icon: LayoutDashboard, module: "warehouse" },
        // 1) المخزون والحركات.
        { label: "المخزون والحركات", path: "/warehouse/movements", icon: Activity, children: [
          { label: "حركات المخزون", path: "/warehouse/movements", icon: Activity },
          { label: "الفئات", path: "/warehouse/categories", icon: FolderOpen },
          { label: "الموردون", path: "/warehouse/suppliers", icon: Users },
          { label: "جرد المخزون", path: "/warehouse/inventory-count", icon: ClipboardCheck },
        ]},
        // 2) الدفعات والتسلسلات والجرد المتقدّم — صفحة قشرة بتبويبات
        // (warehouse-advanced.tsx) تضمّ الدفعات/التسلسلات/الجرد الدوري/ABC. أُزيلت
        // المداخل المنفصلة المكرّرة معها (CROSS_MODULE_DUPLICATION_AUDIT — قرار
        // المالك «أبقِ القشرة، احذف الإخوة»). مساراتها تبقى مُركَّبة وقابلة للبحث،
        // ومُدرجة في SUPERSEDED_BY_SHELL بحارس التغطية فلا تُعدّ أيتامًا.
        { label: "عمليات متقدّمة (دفعات/تسلسلات/جرد/تصنيف أ ب ج)", path: "/warehouse/advanced", icon: Layers },
        // 3) التقارير.
        { label: "التقارير", path: "/warehouse/reports/accuracy", icon: FileBarChart, children: [
          { label: "تقرير دقة الجرد", path: "/warehouse/reports/accuracy", icon: BarChart3 },
          { label: "تقرير الأصناف المنتهية", path: "/warehouse/reports/expiring", icon: AlertTriangle },
          { label: "تقادم الدفعات", path: "/warehouse/reports/lot-aging", icon: FileBarChart },
        ]},
      ]},
      { label: "المتجر", path: "/store", icon: ShoppingCart, module: "store", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        // PR-1 / #2163 — was module:"bi" (FU-2).
        { label: "لوحة التحكم", path: "/module-dashboards?tab=store", icon: LayoutDashboard, module: "store" },
        { label: "المنتجات", path: "/store/products", icon: Package },
        { label: "الطلبات", path: "/store/orders", icon: ShoppingCart },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 8. إدارة الأملاك
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "إدارة الأملاك",
    items: [
      { label: "إدارة الأملاك", path: "/properties/dashboard", icon: Home, module: "property", children: [
        // #2493-follow-up — كانت «إدارة الأملاك» قائمة مسطّحة من 14 مدخلاً.
        // أُعيد تنظيمها إلى لوحة + مجموعات موضوعية (تشغيل ثم تقارير/أدلة).
        // إعادة تجميع فقط — كل مسار محفوظ.
        { label: "نظرة عامة", path: "/properties/dashboard", icon: LayoutDashboard },
        // 1) العقارات والأطراف.
        { label: "العقارات والأطراف", path: "/properties/buildings", icon: Building2, children: [
          { label: "المباني والمجمعات", path: "/properties/buildings", icon: Building2 },
          { label: "الوحدات العقارية", path: "/properties", icon: Building },
          { label: "المستأجرون", path: "/properties/tenants", icon: Users2 },
          { label: "الملاك", path: "/properties/owners", icon: User },
        ]},
        // 2) العقود والمالية.
        { label: "العقود والمالية", path: "/properties/contracts", icon: FileSignature, children: [
          { label: "عقود الإيجار", path: "/properties/contracts", icon: FileSignature },
          { label: "المدفوعات", path: "/properties/payments", icon: Banknote },
          { label: "كشف حساب المالك", path: "/properties/owners/statement", icon: FileBarChart },
          { label: "ودائع الضمان", path: "/properties/deposits", icon: Banknote },
          // كانت orphan: صفحة المبيعات العقارية (بيع الوحدات) مركّبة بلا مدخل في القائمة.
          { label: "المبيعات العقارية", path: "/properties/sales", icon: TrendingUp },
        ]},
        // 3) الصيانة والتفتيش.
        { label: "الصيانة والتفتيش", path: "/properties/maintenance", icon: Hammer, children: [
          { label: "طلبات الصيانة", path: "/properties/maintenance", icon: Hammer },
          { label: "الفحص والتفتيش", path: "/properties/inspections", icon: ClipboardCheck },
        ]},
        // 4) التقارير والأدلة.
        { label: "التقارير والأدلة", path: "/properties/occupancy-report", icon: BarChart3, children: [
          { label: "تقرير الإشغال", path: "/properties/occupancy-report", icon: BarChart3 },
          { label: "دليل العقارات", path: "/properties/guide", icon: BookOpen },
          // UX Nav Governance (شريحة 12) — أُزيل المدخل المكرّر «دليل إرشادي مصور»
          // (كان → /guide/properties، وهو redirect إلى /properties/guide). يكفي
          // مدخل «دليل العقارات» الواحد؛ الاسم البديل محفوظ للبحث في
          // navigation.canonical-map.ts، والمسار /guide/properties يبقى redirect
          // (لا حذف). الحارس المُرقّى يعدّه off-sidebar فلا يصير orphan.
        ]},
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 9. العمرة
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "العمرة",
    items: [
      // GAP_MATRIX item #20 — backend mounts /umrah under
      // requireModule("operations") and ROLE_DEFAULT_MODULES doesn't
      // contain "umrah" as a key at all. Setting module: "umrah" on the
      // sidebar entry meant the filter checked an access flag the
      // backend never granted, so the entry collapsed for everyone
      // except owner/GM (who get every module).
      { label: "إدارة العمرة", path: "/umrah", icon: CloudRain, module: "operations", children: [
        // #2488-follow-up — كانت «إدارة العمرة» قائمة مسطّحة من 27 مدخلاً بلا
        // تجميع. أُعيد تنظيمها إلى مجموعات فرعية موضوعية (نفس نمط الأسطول/المالية):
        // اللوحة أولاً ثم دورة العمل ثم التقارير ثم الإعدادات آخراً. إعادة تجميع
        // فقط — كل مسار/صلاحية محفوظ (لا أيتام ولا روابط ميتة).
        { label: "لوحة التشغيل", path: "/umrah", icon: LayoutDashboard },
        // 1) المعتمرون والوكلاء.
        // U-18-P2 — sidebar plural unification. Standalone labels use
        // the nominative plural ("المعتمرون", "الوكلاء الرئيسيون",
        // "الوكلاء الفرعيون") per the UMRAH_CANONICAL_GLOSSARY.md
        // rule. Object-position phrases ("حركات المعتمرين",
        // "كشف المعتمرين", etc.) keep the accusative form.
        { label: "المعتمرون والوكلاء", path: "/umrah/pilgrims", icon: Users, children: [
          { label: "المعتمرون", path: "/umrah/pilgrims", icon: Users },
          { label: "المعتمرون المعفون", path: "/umrah/exempt-pilgrims", icon: Users },
          { label: "الوكلاء الرئيسيون", path: "/umrah/agents", icon: Building2 },
          { label: "الوكلاء الفرعيون", path: "/umrah/sub-agents", icon: Users },
        ]},
        // 2) المواسم والباقات والمجموعات والسكن.
        { label: "المواسم والباقات", path: "/umrah/seasons", icon: Calendar, children: [
          { label: "المواسم", path: "/umrah/seasons", icon: Calendar },
          { label: "الباقات", path: "/umrah/packages", icon: Package },
          { label: "المجموعات", path: "/umrah/groups", icon: Users2 },
          { label: "السكن والإقامة", path: "/umrah/accommodations", icon: Home },
        ]},
        // 3) التسعير والعمولات.
        { label: "التسعير والعمولات", path: "/umrah/pricing", icon: DollarSign, children: [
          { label: "التسعير", path: "/umrah/pricing", icon: DollarSign },
          { label: "خطط العمولات", path: "/umrah/commission-plans", icon: TrendingUp },
          { label: "حساب العمولات", path: "/umrah/commission-calculations", icon: Calculator },
        ]},
        // 4) المبيعات والفوترة.
        { label: "المبيعات والفوترة", path: "/umrah/sales-wizard", icon: Sparkles, children: [
          { label: "معالج المبيعات", path: "/umrah/sales-wizard", icon: Sparkles },
          { label: "الفواتير", path: "/umrah/invoices", icon: Receipt },
          { label: "المدفوعات", path: "/umrah/payments", icon: Banknote },
          { label: "طلبات الاسترداد", path: "/umrah/refund-requests", icon: RefreshCw },
        ]},
        // 5) العمليات والنقل.
        { label: "العمليات والنقل", path: "/umrah/daily-runsheet", icon: CalendarClock, children: [
          { label: "البرنامج اليومي", path: "/umrah/daily-runsheet", icon: Calendar },
          { label: "التقويم التشغيلي", path: "/umrah/calendar", icon: CalendarClock },
          { label: "النقل والمواصلات", path: "/umrah/transport", icon: Truck },
          { label: "طلبات النقل", path: "/umrah/transport-requests", icon: Truck, perm: "umrah:list" },
        ]},
        // 6) الالتزام والمخالفات.
        { label: "الالتزام والمخالفات", path: "/umrah/compliance", icon: FileCheck, children: [
          { label: "امتثال العمرة", path: "/umrah/compliance", icon: FileCheck },
          { label: "المخالفات النظامية", path: "/umrah/violations", icon: Shield },
          { label: "الغرامات", path: "/umrah/penalties", icon: AlertTriangle },
        ]},
        // 7) التسوية والبيانات.
        { label: "التسوية والبيانات", path: "/umrah/reconciliation", icon: RefreshCw, children: [
          { label: "التسوية والمطابقة", path: "/umrah/reconciliation", icon: RefreshCw },
          { label: "استيراد بيانات العمرة", path: "/umrah/import", icon: FileText },
          { label: "المرفقات", path: "/umrah/attachments", icon: Paperclip },
        ]},
        // 8) التقارير — مجموعة قائمة، تبقى كما هي.
        { label: "التقارير", path: "/umrah/reports", icon: FileBarChart, children: [
          { label: "أرصدة الوكلاء", path: "/umrah/reports/agent-balances", icon: DollarSign },
          { label: "أرصدة الوكلاء الفرعيين", path: "/umrah/reports/subagent-balances", icon: DollarSign },
          { label: "حركات المعتمرين", path: "/umrah/reports/pilgrim-movements", icon: Activity },
          // بقية التقارير كانت مركّبة وتُفتح من مركز التقارير فقط (orphans) —
          // أُضيفت هنا حتى تكون كل المسارات قابلة للوصول من القائمة أيضاً.
          { label: "ربحية المجموعات", path: "/umrah/reports/group-profitability", icon: TrendingUp },
          { label: "ربحية الوكلاء", path: "/umrah/reports/agent-profitability", icon: TrendingUp },
          { label: "ملخّص العمولات", path: "/umrah/reports/commissions-summary", icon: Calculator },
          { label: "تكاليف العمرة", path: "/umrah/reports/umrah-costs", icon: DollarSign },
          { label: "ملخّص فواتير نُسك", path: "/umrah/reports/nusk-invoices-summary", icon: Receipt },
          { label: "ملخّص فواتير العملاء", path: "/umrah/reports/sales-invoices-summary", icon: Receipt },
          { label: "النقل المرتبط بالعمرة", path: "/umrah/reports/transport-requests", icon: Truck },
          { label: "ملخّص المخالفات", path: "/umrah/reports/violations-summary", icon: Shield },
          { label: "ملخّص أخطاء الاستيراد", path: "/umrah/reports/import-errors-summary", icon: AlertTriangle },
        ]},
        // 9) الإعدادات آخراً (معيار #1715).
        { label: "الإعدادات", path: "/umrah/settings", icon: Settings },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 6. العلاقات
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "العلاقات",
    items: [
      { label: "العملاء والمبيعات", path: "/clients", icon: Target, module: "crm", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        // PR-1 / #2163 — was module:"bi" (FU-2).
        { label: "لوحة التحكم", path: "/module-dashboards?tab=crm", icon: LayoutDashboard, module: "crm" },
        { label: "الفرص التجارية", path: "/crm", icon: Target },
        { label: "قمع المبيعات", path: "/crm/pipeline", icon: TrendingUp },
        { label: "أنشطة علاقات العملاء", path: "/crm/activities", icon: Activity },
      ]},
      { label: "الدعم الفني", path: "/support", icon: Headphones, module: "support", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        // PR-1 / #2163 — was module:"bi" (FU-2).
        { label: "لوحة التحكم", path: "/module-dashboards?tab=support", icon: LayoutDashboard, module: "support" },
        { label: "التذاكر", path: "/support", icon: Headphones },
        { label: "قاعدة المعرفة", path: "/support/kb", icon: BookOpen },
        { label: "الردود الجاهزة", path: "/support/replies", icon: MessageSquare },
      ]},
      { label: "التسويق", path: "/marketing", icon: Megaphone, module: "marketing", children: [
        { label: "الحملات", path: "/marketing", icon: Megaphone },
        { label: "قوالب واتساب", path: "/marketing/whatsapp-templates", icon: MessageSquare },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 7. الإدارة والحوكمة (من اليومي → الرسمي → الامتثال)
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الإدارة والحوكمة",
    items: [
      // مركز الإدارة والحوكمة — مدخل واحد يجمع وحدات الإدارة (الطلبات، المستندات،
      // التواصل، القانونية، الحوكمة، الإقفال). قسم متعدّد الوحدات، فالمدخل بلا module
      // والأبناء يحملون وحداتهم. مساره افتراضي (#governance) لأنه حاوية بصرية لا صفحة
      // (النقر يوسّع، ولا يظهر في breadcrumb) فلا يصير رابطًا لمسار محمي (/governance)
      // قد يضغطه مستخدم طلبات/مستندات لا يملك وحدة الحوكمة فيصطدم بمنع الوصول.
      { label: "مركز الإدارة والحوكمة", path: "#governance", icon: Briefcase, children: [
        { label: "مركز الطلبات", path: "/requests", icon: ClipboardCheck, module: "requests", children: [
          { label: "تقديم طلب", path: "/requests", icon: ClipboardCheck },
          { label: "أنواع الطلبات", path: "/requests/types", icon: ListTodo },
          // «سير العمل» (/requests/workflows) dropped from the sidebar: its `workflows`
          // table has no executor (the live approval engine is approval_chains), so it
          // surfaced a non-functional feature. Route kept reachable (off-sidebar).
        ]},
        { label: "المستندات", path: "/documents", icon: FileText, module: "documents", children: [
          { label: "جميع المستندات", path: "/documents", icon: FileText },
          { label: "المجلدات", path: "/documents/folders", icon: FolderOpen },
          { label: "الأرشيف", path: "/documents/archive", icon: Archive },
          { label: "قراءة المستندات (OCR)", path: "/documents/ocr/review", icon: FileCheck },
          { label: "القوالب", path: "/documents/templates", icon: FilePlus },
          { label: "رفع مستند", path: "/documents/upload", icon: FilePlus },
        ]},
        { label: "التواصل", path: "/inbox", icon: Mail, module: "comms", children: [
          { label: "صندوقي الموحّد", path: "/inbox", icon: Mail },
          { label: "الصناديق المتصلة", path: "/mailboxes", icon: Send },
          { label: "بريد الشركة", path: "/company-email", icon: Mail, perm: "admin:update" },
          { label: "الصادر والوارد", path: "/correspondence", icon: FileText },
          // Phase 5: communications dashboard is admin-only — non-managers
          // get redirected to /inbox automatically. Sidebar hides it for
          // them via minRoleLevel.
          { label: "مراقبة الاتصالات", path: "/communications", icon: MessageSquare, minRoleLevel: 50 },
          { label: "محرك الإشعارات", path: "/communications/notification-engine", icon: Zap, minRoleLevel: 50 },
        ]},
        { label: "الشؤون القانونية", path: "/legal/cases", icon: Scale, module: "legal", minRoleLevel: 50, children: [
          { label: "نظرة عامة", path: "/legal", icon: LayoutDashboard },
          { label: "القضايا", path: "/legal/cases", icon: Briefcase },
          { label: "العقود القانونية", path: "/legal/contracts", icon: FileSignature },
          { label: "الوثائق القانونية", path: "/legal/documents", icon: FileText },
          { label: "الجلسات القادمة", path: "/legal/sessions", icon: Calendar },
          { label: "الأحكام القضائية", path: "/legal/judgments", icon: CheckCircle },
          { label: "المراسلات", path: "/legal/correspondence", icon: Mail },
        ]},
        { label: "الحوكمة والامتثال", path: "/governance/policies", icon: Shield, module: "governance", minRoleLevel: 60, children: [
          { label: "نظرة عامة", path: "/governance", icon: Shield },
          { label: "السياسات", path: "/governance/policies", icon: FileCheck },
          { label: "مخاطر الحوكمة", path: "/governance/risks", icon: AlertTriangle },
          { label: "التدقيق", path: "/governance/audits", icon: ClipboardCheck },
          { label: "الامتثال المؤسسي", path: "/governance/compliance", icon: CheckCircle },
          { label: "الإجراءات التصحيحية", path: "/governance/capa", icon: Wrench },
        ]},
        { label: "الإقفال اليومي", path: "/daily-close", icon: CheckSquare, minRoleLevel: 50 },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 8. النظام
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "النظام",
    items: [
      // إدارة النظام — مدخل وحدة واحد يجمع أدوات النظام (ذكاء الأعمال، الإدارة، الأتمتة،
      // الطباعة، الاشتراك، الإعدادات). قسم متعدّد الوحدات، فالمدخل بلا module والأبناء
      // يحملون وحداتهم وصلاحياتهم كما هي. مساره افتراضي (#system) لأنه حاوية بصرية لا
      // صفحة: النقر يوسّع لا يُبحر، ولا يظهر في مسار التنقّل (breadcrumb) فلا يصير
      // رابطًا لمسار محمي (/admin) قد يضغطه مستخدم bi/settings فيصطدم بمنع الوصول.
      { label: "إدارة النظام", path: "#system", icon: Shield, children: [
        { label: "ذكاء الأعمال", path: "/bi", icon: LineChart, module: "bi", minRoleLevel: 50, children: [
          { label: "لوحة التحليلات", path: "/bi", icon: LineChart },
          { label: "تحليل الأداء", path: "/bi/operations", icon: Activity },
          { label: "التقارير الإدارية", path: "/bi/admin-reports", icon: FileBarChart },
          // UX Nav Governance (موجة التنقّل، شريحة 6) — أُزيلت 3 مداخل كانت تؤول
          // جميعها إلى /bi عبر redirect: «مؤشرات الأداء» (/bi/kpis)، «التقارير
          // التحليلية» (/bi/reports)، «لوحات BI» (/bi/dashboards). صار «ذكاء
          // الأعمال» مدخلاً واحداً بدل أربعة بنفس الوجهة. الأسماء الثلاثة محفوظة
          // كأسماء بحث في navigation.canonical-map.ts (المبدأ #6)، والمسارات تبقى
          // مُركَّبة كـ redirect (لا حذف — المبدأ #3). check-sidebar-coverage رُقِّي
          // ليعدّ مسارات الـ redirect off-sidebar مشروعة فلا تصير orphan.
          { label: "الرؤى الذكية", path: "/insights", icon: Sparkles },
          { label: "لوحة الذكاء", path: "/intelligence", icon: Brain },
          { label: "منصة الذكاء الاصطناعي", path: "/intelligence/ai-workbench", icon: Sparkles },
        ]},
        // 17-item "مدير النظام" was one flat list — broke into 4 themed
        // sub-groups so an admin can find a specific tool without scanning
        // the whole list. Order: identity first, then ops, then integrations,
        // then audit trails.
        { label: "مدير النظام", path: "/admin", icon: Shield, module: "admin", minRoleLevel: 90, children: [
          { label: "المستخدمين والصلاحيات", path: "/admin/users", icon: KeyRound, children: [
            { label: "المستخدمين", path: "/admin/users", icon: Users, perm: ["admin:list", "admin:update"], permMode: "any" },
            { label: "إنشاء سريع وصلاحيات", path: "/admin/user-onboarding", icon: UserPlus, perm: ["admin:update"], permMode: "any" },
            { label: "الأدوار والصلاحيات", path: "/admin", icon: KeyRound, perm: ["admin.roles:view", "admin.roles:update"], permMode: "any" },
            { label: "مصفوفة الأدوار", path: "/admin/rbac-matrix", icon: Shield, perm: "admin.roles:view" },
            { label: "قوالب المسميات الوظيفية", path: "/admin/job-titles", icon: Shield, perm: "hr.employees:update" },
            { label: "الأدوار", path: "/admin/roles", icon: KeyRound, perm: ["admin.roles:view", "admin.roles:update"], permMode: "any" },
            { label: "الصلاحيات الفعلية للمستخدم", path: "/admin/effective-permissions", icon: ShieldCheck, perm: ["admin:view", "admin:list"], permMode: "any" },
          ]},
          { label: "المراقبة والمتابعة", path: "/admin/monitoring", icon: Activity, children: [
            { label: "مركز المراقبة", path: "/admin/monitoring", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "الوثائق الحكومية المنتهية", path: "/admin/expiring-docs", icon: Clock, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "مرصد المراقبة الموحّد", path: "/admin/observability", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "خارطة #1139 الحيّة", path: "/admin/master-plan", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "تقرير المخالفات", path: "/admin/violations-report", icon: AlertTriangle, perm: ["hr:approve", "admin:view"], permMode: "any" },
            { label: "كتالوج الأحداث", path: "/admin/event-monitor", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "صندوق الأحداث الصادرة", path: "/admin/outbox", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "تنبيهات البنية التحتية", path: "/admin/infra-alerts", icon: AlertTriangle, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "تتبّع الرحلات الحيّة", path: "/admin/journeys", icon: GitBranch, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "مراقبة دورة الحياة", path: "/admin/lifecycle-monitor", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "حاكم النظام", path: "/admin/system-governor", icon: Shield, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "سجل الكيانات", path: "/admin/system-registry", icon: Network, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "سجل النطاقات", path: "/admin/domain-registry", icon: Network, perm: ["admin:list", "admin:view"], permMode: "any" },
          ]},
          { label: "حوكمة الصلاحيات", path: "/admin/policy-engine", icon: Shield, children: [
            { label: "محرك سياسات الصلاحيات", path: "/admin/policy-engine", icon: Shield, perm: "admin:update" },
            { label: "تجاوزات الموافقات", path: "/admin/approval-overrides", icon: Bell, perm: "admin:update" },
            { label: "حماية البيانات الشخصية", path: "/admin/pdpl", icon: Shield, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "التوقيع الرقمي", path: "/admin/digital-signature", icon: FileSignature, perm: ["admin:list", "admin:view"], permMode: "any" },
          ]},
          { label: "تشخيص محاسبي", path: "/admin/gl-reconciliation", icon: ShieldAlert, children: [
            { label: "تسوية دفتر الأستاذ", path: "/admin/gl-reconciliation", icon: ShieldAlert, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "إخفاقات الترحيل", path: "/admin/posting-failures", icon: AlertTriangle, perm: ["admin:list", "admin:view"], permMode: "any" },
          ]},
          { label: "التكاملات والاتصالات", path: "/admin/integrations", icon: Mail, children: [
            { label: "مركز التكاملات", path: "/admin/integrations", icon: Mail, perm: "admin:update" },
            { label: "مركز التحكّم بالاتصالات", path: "/admin/communication-control", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "مركز التحكم بالمقسم الهاتفي", path: "/admin/pbx-control", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "إعدادات المزوّدات", path: "/admin/vendor-settings", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "تشخيص التكاملات", path: "/admin/integrations-diagnostics", icon: Activity, perm: "admin:update" },
            { label: "مراجعات الفوترة الإلكترونية", path: "/admin/zatca-audits", icon: ShieldAlert, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "حوكمة الذكاء الاصطناعي", path: "/admin/ai-governance", icon: Brain, perm: ["admin:list", "admin:view"], permMode: "any" },
            { label: "مختبر الذكاء", path: "/admin/intelligence-playground", icon: Brain, perm: "admin:update" },
            { label: "استيراد البيانات (إداري)", path: "/admin/data-import", icon: FilePlus, perm: "admin:update" },
          ]},
          { label: "سجلات التدقيق", path: "/admin/logs", icon: ScrollText, children: [
            { label: "سجل تدقيق النظام", path: "/admin/logs", icon: ScrollText, perm: ["audit:read", "admin:read"], permMode: "any", minRoleLevel: 90 },
            { label: "سجل الحركات", path: "/activity-log", icon: Activity },
          ]},
        ]},
        // Agent 7 (visibility consistency) — dropped "automation:write"
        // from the perm list: it isn't in FEATURE_PERMISSIONS or in legacy
        // PERMISSIONS, so it can never be granted and the OR branch was
        // dead. Backend routes/automation.ts authorizes on admin:list /
        // admin:update, so admin:update is the only meaningful gate here.
        { label: "الأتمتة", path: "/automation", icon: Zap, module: "admin", minRoleLevel: 60, perm: "admin:update" },
        { label: "التقارير المجدولة", path: "/reports/scheduled", icon: CalendarClock, module: "bi", minRoleLevel: 50, perm: ["bi:read", "reports:read"], permMode: "any" },
        // Printing entries were scattered across admin, reports, manager-board and
        // settings — consolidated here into one "الطباعة والمطبوعات" group. Each
        // child keeps its original module/perm/minRoleLevel so visibility filtering
        // is unchanged; only the grouping moved (no page removed → no orphans).
        { label: "الطباعة والمطبوعات", path: "/reports/print-log", icon: Printer, minRoleLevel: 50, children: [
          { label: "سجل المطبوعات", path: "/reports/print-log", icon: Printer, module: "bi", minRoleLevel: 50, perm: "print_jobs:read" },
          { label: "موافقات إعادة الطباعة", path: "/manager-board/reprint-approvals", icon: Printer, minRoleLevel: 50, perm: "print:reprint:approve" },
          // مدخلان لنفس الصفحة (/admin/print-templates) لجمهورَي صلاحية مختلفين:
          // مستخدمو الإعدادات (L70 + templates:read) والمدراء (L90 + admin:*). مدخل
          // الإعدادات يهبط مباشرة بدل المرور عبر redirect المسار /settings/print-templates
          // (يبقى ذلك المسار مُركَّبًا في settingsRoutes للروابط القديمة).
          { label: "قوالب الطباعة", path: "/admin/print-templates", icon: Printer, module: "settings", minRoleLevel: 70, perm: "templates:read" },
          { label: "قوالب الطباعة (الإدارة)", path: "/admin/print-templates", icon: Printer, module: "admin", minRoleLevel: 90, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "تشخيص الطباعة", path: "/admin/print-diagnostics", icon: Printer, module: "admin", minRoleLevel: 90, perm: ["admin:list", "admin:view"], permMode: "any" },
        ]},
        // كانت orphan: إدارة اشتراك المنشأة (الحالة/التفعيل/تمديد التجربة) — صفحة
        // admin مستقلة مبوّبة على admin:view (على نمط «الأتمتة»).
        { label: "اشتراك المنشأة", path: "/admin/subscription", icon: CreditCard, module: "admin", perm: "admin:view" },
        { label: "الإعدادات", path: "/settings", icon: Cog, module: "settings", minRoleLevel: 70, children: [
          { label: "عام", path: "/settings", icon: Cog },
          { label: "الفروع", path: "/settings/branches", icon: Building, perm: "settings:write" },
          { label: "الشركات", path: "/settings/companies", icon: Building2, perm: "settings:write" },
          { label: "الأقسام", path: "/settings/departments", icon: Network, perm: "settings:write" },
          { label: "قواعد الأعمال", path: "/settings/rules", icon: Zap, perm: "settings:write" },
          { label: "سجل مراجعة الإعدادات", path: "/settings/audit-log", icon: ScrollText, perm: ["audit:read", "settings:write"], permMode: "any" },
        ]},
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // الموقع الإلكتروني — نظام إدارة محتوى موقع الشركة (متعدد المستأجرين).
  // موائمة بدون تكرار: تتحكّم غيث في موقع كل شركة من واجهة الإدارة هذه.
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الموقع الإلكتروني",
    items: [
      { label: "الموقع الإلكتروني", path: "/website", icon: Globe, module: "website", children: [
        { label: "إعدادات الموقع", path: "/website", icon: Settings },
        { label: "الباقات", path: "/website/packages", icon: Package },
        { label: "الفنادق", path: "/website/hotels", icon: Building2 },
        { label: "الخدمات", path: "/website/services", icon: LayoutGrid },
        { label: "المدونة", path: "/website/posts", icon: FileText },
        { label: "الأسئلة الشائعة", path: "/website/faqs", icon: HelpCircle },
        { label: "آراء العملاء", path: "/website/testimonials", icon: MessageSquare },
        { label: "فريق العمل", path: "/website/team", icon: Users },
        { label: "معرض الصور", path: "/website/gallery", icon: ImageIcon },
        { label: "البانرات الإعلانية", path: "/website/banners", icon: Megaphone },
        { label: "قائمة التنقّل", path: "/website/nav-items", icon: Menu },
      ]},
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Derived governance metadata view
// ──────────────────────────────────────────────────────────────────────────

export type PageStatus = "active" | "deprecated" | "hidden";
export type PageType =
  | "dashboard"
  | "list"
  | "detail"
  | "create"
  | "report"
  | "tool"
  | "group";

export interface PageMeta {
  /** stable id derived from the path */
  id: string;
  title: string;
  path: string;
  /** module gate (inherited from the nearest ancestor that declares one) */
  module?: ModuleType;
  /** the top-level section item this page rolls up to (its "leader") */
  leaderPath: string;
  /** human section title */
  section: string;
  /** parent label chain, if nested */
  parent?: string;
  /** fine-grained backend permissions required to see this entry */
  requiredPermissions?: string[];
  permMode: "all" | "any";
  /** minimum role level (inherited from ancestors when not set) */
  minRoleLevel?: number;
  /** subscription / feature gate — defaults to the module key */
  subscription?: string;
  pageType: PageType;
  showInSidebar: boolean;
  status: PageStatus;
}

function pathToId(p: string): string {
  return p
    .split(/[?#]/)[0]
    .replace(/^\//, "")
    .replace(/\//g, ".")
    .replace(/:/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    || "root";
}

function classifyPageType(p: string, hasChildren: boolean): PageType {
  if (hasChildren) return "group";
  const path = p.split(/[?#]/)[0];
  if (/\/create$/.test(path) || /\/new$/.test(path)) return "create";
  if (/:/.test(path)) return "detail";
  if (/dashboard|cockpit|board|overview|module-dashboards/.test(path)) return "dashboard";
  if (/\/reports?(\/|$)|\/report$|statement|summary/.test(path)) return "report";
  return "list";
}

/**
 * Flatten allNavSections into a per-page metadata list. Pure + deterministic;
 * carries no React state, so it is safe to import from scripts and tests.
 */
export function getNavigationRegistry(): PageMeta[] {
  const out: PageMeta[] = [];

  function walk(
    items: NavItem[],
    section: string,
    leaderPath: string | undefined,
    parentLabel: string | undefined,
    inheritedModule: ModuleType | undefined,
    inheritedRoleLevel: number | undefined,
  ) {
    for (const item of items) {
      const mod = item.module ?? inheritedModule;
      const roleLevel = item.minRoleLevel ?? inheritedRoleLevel;
      const leader = leaderPath ?? item.path;
      const hasChildren = !!item.children && item.children.length > 0;
      if (!item.path.startsWith("#")) {
        const perms = item.perm
          ? Array.isArray(item.perm)
            ? item.perm
            : [item.perm]
          : undefined;
        out.push({
          id: pathToId(item.path),
          title: item.label,
          path: item.path,
          module: mod,
          leaderPath: leader,
          section,
          parent: parentLabel,
          requiredPermissions: perms,
          permMode: item.permMode ?? "all",
          minRoleLevel: roleLevel,
          subscription: mod,
          pageType: classifyPageType(item.path, hasChildren),
          showInSidebar: true,
          status: "active",
        });
      }
      if (hasChildren) {
        walk(
          item.children!,
          section,
          leader,
          parentLabel ? `${parentLabel} / ${item.label}` : item.label,
          mod,
          roleLevel,
        );
      }
    }
  }

  for (const section of allNavSections) {
    walk(section.items, section.title, undefined, undefined, undefined, undefined);
  }
  return out;
}
