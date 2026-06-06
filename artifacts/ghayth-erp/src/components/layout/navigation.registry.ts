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
  Target, Network, Receipt, Wallet, Car, Wrench, Fuel, User,
  FileCheck, AlertTriangle, ClipboardCheck, Building, FileSignature, Users2,
  Hammer, TrendingUp, FileBarChart, FolderOpen, Archive, ListTodo, GitBranch,
  FilePlus, CalendarClock, ScrollText, Cog, Bell, Mail,
  MessageSquare, Scale, Briefcase, Megaphone, ShoppingCart, Package, Activity,
  LineChart, Menu, X, LogOut, Headphones, CheckCircle,
  KeyRound, CloudRain, MapPin, QrCode, FileSignature as FileSignature2,
  BarChart3, UserPlus, ClipboardList, Navigation, Percent, Zap,
  Sparkles, Brain, Search, ArrowLeftRight,
  Plus, Printer, CheckSquare, Download, Send, Star, Settings, BookOpen, Radar, Timer, ListChecks,
  BarChart2, ShieldAlert, Flag, Lock, Layers, Calculator, LayoutGrid,
  RefreshCw, Globe, TrendingDown as TrendingDown2,
  Satellite, Bot, HardDrive, Video as VideoIcon, Award,
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
  // 1. الرئيسية
  // ══════════════════════════════════════════════════════════════════════
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
      { label: "كل الخدمات", path: "/services", icon: LayoutGrid },
      { label: "التقويم الموحد", path: "/calendar", icon: Calendar, minRoleLevel: 20 },
      { label: "مساحاتي", path: "/my-space", icon: User, children: [
        { label: "مساحتي", path: "/my-space", icon: User },
        { label: "مساحة العمل", path: "/workspace", icon: LayoutGrid },
        { label: "إشعاراتي", path: "/notifications", icon: Bell },
      ]},
      { label: "لوحات الإدارة", path: "/manager-board", icon: Users, minRoleLevel: 40, children: [
        { label: "لوحة المدير", path: "/manager-board", icon: Users },
        { label: "مساحة المدير", path: "/manager-workspace", icon: Users },
        { label: "لوحات مؤشرات المسارات", path: "/module-dashboards", icon: LayoutDashboard },
        { label: "لوحة القيادة التنفيذية", path: "/exec-dashboard", icon: Shield, minRoleLevel: 70 },
        { label: "اسأل غيث", path: "/assistant", icon: Sparkles, minRoleLevel: 70 },
      ]},
      { label: "مراكز التحكم", path: "/action-center", icon: Briefcase, minRoleLevel: 20, children: [
        { label: "مركز القرارات", path: "/action-center", icon: Briefcase },
        { label: "مركز العمليات", path: "/operations-center", icon: Zap, minRoleLevel: 40 },
        { label: "مركز الالتزامات", path: "/obligations", icon: Clock, minRoleLevel: 30 },
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
    items: [
      // Agent-5 (route↔backend consistency): /api/module-dashboards is gated
      // by module="bi"; the frontend route registry tags it module="bi" too.
      // Sidebar module key changed from "hr" → "bi" so visibility matches.
      { label: "لوحة الموارد البشرية", path: "/module-dashboards?tab=hr", icon: LayoutDashboard, module: "bi" },
      { label: "نظرة عامة", path: "/hr", icon: LayoutDashboard, module: "hr" },
      { label: "التوظيف", path: "/hr/recruitment", icon: Briefcase, module: "hr", children: [
        { label: "الوظائف", path: "/hr/recruitment", icon: Briefcase, subKey: "recruitment" },
        { label: "التوظيف المتقدم", path: "/hr/recruitment/advanced", icon: BarChart3, subKey: "recruitment" },
        { label: "المتقدمين", path: "/hr/recruitment/applications", icon: Users2, subKey: "recruitment" },
      ]},
      { label: "الموظفون", path: "/employees", icon: Users, module: "hr", children: [
        { label: "قائمة الموظفين", path: "/employees", icon: Users, subKey: "employees" },
        { label: "تفعيل الموظفين", path: "/hr/employee-activation", icon: UserPlus, subKey: "employees" },
        { label: "مراجعة التعيين", path: "/hr/onboarding-review", icon: ClipboardCheck, subKey: "employees" },
        { label: "نقل الموظفين", path: "/hr/transfers", icon: ArrowLeftRight, subKey: "employees" },
        { label: "الوثائق المنتهية", path: "/hr/expiring-documents", icon: AlertTriangle, subKey: "employees" },
        { label: "الهيكل التنظيمي", path: "/hr/organization", icon: Network, subKey: "organization" },
        { label: "الهيكل المصوّر", path: "/hr/organization/structure", icon: GitBranch, subKey: "organization" },
        { label: "التفويضات", path: "/hr/delegations", icon: Users2, subKey: "organization" },
      ]},
      { label: "الورديات", path: "/hr/shifts", icon: CalendarClock, module: "hr", children: [
        { label: "جدول الورديات", path: "/hr/shifts", icon: CalendarClock, subKey: "shifts" },
        { label: "إدارة الورديات", path: "/hr/shifts/management", icon: Cog, subKey: "shifts" },
      ]},
      { label: "الحضور والانصراف", path: "/hr/attendance", icon: Clock, module: "hr", children: [
        { label: "السجل اليومي", path: "/hr/attendance", icon: Clock, subKey: "attendance" },
        { label: "تقارير الحضور", path: "/hr/attendance/reports", icon: BarChart3, subKey: "attendance" },
        { label: "التتبع الميداني", path: "/hr/attendance/field-tracking", icon: MapPin, subKey: "attendance" },
        { label: "تسجيل بالرمز المصوّر", path: "/hr/attendance/qr-scanner", icon: QrCode, subKey: "attendance" },
        { label: "الوقت الإضافي", path: "/hr/overtime", icon: Timer, subKey: "attendance" },
        { label: "طلبات الأعذار", path: "/hr/excuse-requests", icon: ClipboardCheck, subKey: "attendance" },
        { label: "سياسة الحضور", path: "/hr/attendance-policy", icon: Settings, subKey: "attendance" },
      ]},
      { label: "الإجازات", path: "/hr/leaves", icon: Calendar, module: "hr", children: [
        { label: "طلبات الإجازة", path: "/hr/leaves", icon: Calendar, subKey: "leaves" },
        { label: "إدارة الإجازات", path: "/hr/leaves/management", icon: ClipboardList, subKey: "leaves" },
        { label: "سلاسل الموافقات", path: "/hr/leaves/approval-chains", icon: GitBranch, subKey: "leaves" },
        { label: "الإجازات الرسمية", path: "/hr/public-holidays", icon: CalendarClock, subKey: "leaves" },
      ]},
      { label: "الرواتب والمستحقات", path: "/hr/payroll", icon: DollarSign, module: "hr", children: [
        { label: "مسيرات الرواتب", path: "/hr/payroll", icon: DollarSign, subKey: "payroll" },
        { label: "مكونات الرواتب", path: "/hr/payroll/salary-components", icon: Percent, subKey: "payroll" },
        { label: "سلف الموظفين", path: "/hr/loans", icon: Wallet, subKey: "payroll" },
        { label: "مكافأة نهاية الخدمة", path: "/hr/gratuity", icon: Banknote, subKey: "payroll" },
        { label: "الاستحقاقات الشهرية", path: "/hr/accruals", icon: ListChecks, subKey: "payroll" },
        { label: "نظام حماية الأجور (WPS)", path: "/hr/wps", icon: Send, subKey: "payroll" },
      ]},
      { label: "الامتثال السعودي", path: "/hr/saudization", icon: Flag, module: "hr", children: [
        { label: "السعودة (نطاقات)", path: "/hr/saudization", icon: Flag, subKey: "employees" },
        { label: "WPS / مدد / بنوك", path: "/hr/saudi-compliance", icon: Flag, subKey: "payroll" },
      ]},
      { label: "الأداء والتطوير", path: "/hr/performance", icon: Target, module: "hr", children: [
        { label: "تقييم الأداء", path: "/hr/performance", icon: Target, subKey: "performance" },
        { label: "التقييم المتقدم", path: "/hr/performance/advanced", icon: BarChart3, subKey: "performance" },
        { label: "التقييم 360°", path: "/hr/evaluation-360", icon: Activity, subKey: "performance" },
        { label: "خطط التطوير الفردية", path: "/hr/idp", icon: BookOpen, subKey: "performance" },
        { label: "تقرير الدوران", path: "/hr/turnover-report", icon: FileBarChart, subKey: "performance" },
      ]},
      { label: "التدريب", path: "/hr/training", icon: GraduationCap, module: "hr", children: [
        { label: "البرامج التدريبية", path: "/hr/training", icon: GraduationCap, subKey: "training" },
        { label: "التدريب المتقدم", path: "/hr/training/advanced", icon: BarChart3, subKey: "training" },
      ]},
      { label: "الانضباط والمخالفات", path: "/hr/violations", icon: Scale, module: "hr", children: [
        { label: "نظرة عامة", path: "/hr/violations", icon: ListChecks, subKey: "violations" },
        { label: "إدارة المخالفات", path: "/hr/violations/management", icon: ClipboardList, subKey: "violations" },
        { label: "المحاضر التأديبية", path: "/hr/violations?tab=memos", icon: FileText, subKey: "violations" },
        { label: "الرصد التلقائي", path: "/hr/violations/auto-detection", icon: Radar, subKey: "violations" },
        { label: "تصعيد العقوبات", path: "/hr/violations/penalty-escalation", icon: TrendingUp, subKey: "violations" },
        { label: "لائحة الانضباط", path: "/hr/discipline/regulation", icon: ScrollText, subKey: "violations" },
      ]},
      { label: "صناديق الواردات HR", path: "/hr/approvals", icon: Bell, module: "hr", subKey: "leaves" },
      { label: "وثائق الموظفين", path: "/hr/documents", icon: FileText, module: "hr", subKey: "employees" },
      { label: "نهاية الخدمة", path: "/hr/exit", icon: LogOut, module: "hr", subKey: "employees" },
      { label: "الخطابات الرسمية", path: "/hr/official-letters", icon: FileSignature2, module: "hr", subKey: "employees" },
      { label: "عقود الموظفين", path: "/hr/contracts", icon: FileSignature, module: "hr", subKey: "employees" },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 4. المالية والمحاسبة
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "المالية والمحاسبة",
    items: [
      { label: "لوحة المالية", path: "/finance", icon: BarChart3, module: "finance" },
      { label: "مركز سير العمل المالي", path: "/finance/workflows-hub", icon: Sparkles, module: "finance" },
      { label: "CFO Cockpit", path: "/finance/cfo-cockpit", icon: BarChart3, module: "finance" },
      { label: "فحص الإغلاق اليومي", path: "/finance/daily-close-checklist", icon: ListChecks, module: "finance" },
      { label: "حزمة الإقفال الشهري", path: "/finance/monthly-close-pack", icon: FileBarChart, module: "finance" },
      { label: "الحسابات والقيود", path: "/finance/accounts", icon: GitBranch, module: "finance", children: [
        { label: "شجرة الحسابات", path: "/finance/accounts", icon: GitBranch },
        { label: "حسابات فرعية", path: "/finance/subsidiary-accounts", icon: Layers },
        { label: "مراكز التكلفة", path: "/finance/cost-centers", icon: Network },
        { label: "شجرة مراكز التكلفة", path: "/finance/cost-centers/tree", icon: Network },
        { label: "ترتيب مراكز التكلفة", path: "/finance/cost-centers/ranking", icon: BarChart3 },
        { label: "كشف الحساب التحليلي", path: "/finance/entity-statements", icon: FileText },
        { label: "القيود اليومية", path: "/finance/journal", icon: ScrollText },
        { label: "ميزان مع تتبّع", path: "/finance/trial-balance-drilldown", icon: Scale },
        { label: "مقارنة ميزان", path: "/finance/trial-balance-comparison", icon: BarChart3 },
        { label: "كاشف الشذوذ", path: "/finance/gl-anomaly-detector", icon: ShieldAlert },
        { label: "طابور الترحيل", path: "/finance/gl-posting-queue", icon: Clock },
        { label: "مركز التسويات", path: "/finance/reconciliation-hub", icon: RefreshCw },
        { label: "القيود اليدوية", path: "/finance/journal-manual", icon: FileSignature },
        { label: "قوالب القيود", path: "/finance/journal-templates", icon: FileText },
        { label: "قوالب قيود سريعة", path: "/finance/journal-quick-templates", icon: Zap },
        { label: "معالج عكس قيد", path: "/finance/journal/reverse", icon: ArrowLeftRight },
        { label: "قيود دورية", path: "/finance/recurring-journals", icon: CalendarClock },
        { label: "تقويم الدورية", path: "/finance/recurring-calendar", icon: Calendar },
        { label: "أرصدة افتتاحية", path: "/finance/opening-balances", icon: FilePlus },
      ]},
      { label: "الفواتير والسندات", path: "/finance/invoices", icon: Receipt, module: "finance", children: [
        { label: "الفواتير", path: "/finance/invoices", icon: Receipt },
        { label: "صف الإرسال", path: "/finance/invoice-send-queue", icon: Send },
        { label: "السندات", path: "/finance/vouchers", icon: FileText },
        { label: "المصروفات", path: "/finance/expenses", icon: Wallet },
        { label: "مصروفات متعددة البنود", path: "/finance/expenses/multi-line", icon: Layers },
        { label: "اعتماد مصاريف بالجملة", path: "/finance/expense-bulk-approvals", icon: CheckSquare },
        { label: "موزّع التكاليف", path: "/finance/expenses/split", icon: Layers },
        { label: "تحويل بين الحسابات", path: "/finance/treasury/transfer", icon: ArrowLeftRight },
        { label: "المقبوضات", path: "/finance/receivables", icon: DollarSign },
        { label: "سند قبض العميل (تطبيق تلقائي)", path: "/finance/receivables/receipt", icon: DollarSign },
        { label: "المدفوعات", path: "/finance/payments", icon: Wallet },
        { label: "دفعات مقدمة من العملاء", path: "/finance/customer-advances", icon: ArrowLeftRight },
        { label: "منضدة دفعات العملاء المقدمة", path: "/finance/customer-advances-workbench", icon: Briefcase },
      ]},
      { label: "المشتريات والموردين", path: "/finance/purchase-orders", icon: ShoppingCart, module: "finance", children: [
        { label: "طلبات الشراء (PR)", path: "/finance/purchase-requests", icon: ClipboardList },
        { label: "أوامر الشراء (PO)", path: "/finance/purchase-orders", icon: ShoppingCart },
        { label: "الموردين", path: "/finance/vendors", icon: Users },
        { label: "منضدة التسوية", path: "/finance/vendor-settlement-workbench", icon: Briefcase },
        { label: "كشف حساب مورد للطباعة", path: "/finance/vendor-statement-print", icon: Printer },
        { label: "ملف المورد 360°", path: "/finance/vendor-360-sheet", icon: Users },
        { label: "إنفاق الموردين", path: "/finance/vendor-spend", icon: BarChart3 },
        { label: "دفعة الدفع", path: "/finance/payment-run", icon: Banknote },
        { label: "تقويم الدفعات", path: "/finance/ap-payment-calendar", icon: Calendar },
        { label: "عقود الموردين", path: "/finance/contracts", icon: FileSignature },
        { label: "متابعة عقود الموردين", path: "/finance/vendor-contracts-tracker", icon: FileSignature },
      ]},
      { label: "النقد والذمم", path: "/finance/treasury", icon: Building, module: "finance", children: [
        { label: "مراقبة البنوك", path: "/finance/bank-accounts-watch", icon: Banknote },
        { label: "الخزينة", path: "/finance/treasury", icon: Wallet },
        { label: "التسوية البنكية", path: "/finance/bank-reconciliation", icon: Building },
        { label: "ورقة عمل تسوية حساب", path: "/finance/account-recon-workpaper", icon: FileSignature },
        { label: "كشف حساب عميل للطباعة", path: "/finance/customer-statement-print", icon: Printer },
        { label: "ملف العميل 360°", path: "/finance/customer-360-sheet", icon: Users },
        { label: "مخاطر العملاء", path: "/finance/customer-risk", icon: AlertTriangle },
        { label: "مخصص ديون مشكوك فيها", path: "/finance/bad-debt-provision", icon: TrendingUp },
        { label: "تقادم الذمم الدائنة", path: "/finance/ap-aging", icon: Clock },
        { label: "لوحة التدفق النقدي", path: "/finance/cashflow", icon: LineChart },
        { label: "توقعات التدفق النقدي", path: "/finance/cash-flow-forecast", icon: TrendingUp },
        { label: "تقويم النقدية", path: "/finance/cash-calendar", icon: Calendar },
        { label: "13-Week Cash", path: "/finance/cash-13week", icon: TrendingUp },
        { label: "حاسبة الوضع النقدي", path: "/finance/cash-position-calculator", icon: Calculator },
      ]},
      { label: "الأصول والعهد", path: "/finance/fixed-assets", icon: Building2, module: "finance", children: [
        { label: "الأصول الثابتة", path: "/finance/fixed-assets", icon: Building2 },
        { label: "سجل الأصول التحليلي", path: "/finance/fixed-asset-register", icon: BarChart3 },
        { label: "إهلاك دفعة واحدة", path: "/finance/fixed-assets/batch-depreciate", icon: TrendingUp },
        { label: "العهد", path: "/finance/custodies", icon: KeyRound },
        { label: "منضدة العُهد", path: "/finance/custody-workbench", icon: KeyRound },
        { label: "تقرير العهد", path: "/finance/custodies/report", icon: FileBarChart },
      ]},
      { label: "الفترات والميزانية", path: "/finance/budget", icon: FileBarChart, module: "finance", children: [
        { label: "الميزانية", path: "/finance/budget", icon: FileBarChart },
        { label: "خريطة حرارية", path: "/finance/budget-heatmap", icon: BarChart3 },
        { label: "الفترات المالية", path: "/finance/fiscal-periods", icon: Calendar },
        { label: "إقفال الفترات", path: "/finance/fiscal-periods-v2", icon: Lock },
        { label: "فحص قبل الإقفال", path: "/finance/period-close-preflight", icon: ShieldAlert },
        { label: "إقفال السنة المالية", path: "/finance/year-end-close", icon: Archive },
      ]},
      { label: "الالتزامات والضمانات", path: "/finance/commitments", icon: FileSignature, module: "finance", children: [
        { label: "الالتزامات", path: "/finance/commitments", icon: FileSignature },
        { label: "الضمانات البنكية", path: "/finance/bank-guarantees", icon: Shield },
      ]},
      { label: "التكاليف والتسويات", path: "/finance/project-costing", icon: FolderOpen, module: "finance", children: [
        { label: "تكاليف المشاريع", path: "/finance/project-costing", icon: FolderOpen },
        { label: "محفظة المركبات", path: "/finance/vehicle-portfolio", icon: BarChart3 },
        { label: "Cost Center P&L", path: "/finance/cost-center-pnl", icon: BarChart3 },
        { label: "تقييم المخزون", path: "/finance/inventory-costing", icon: Package },
        { label: "المعاملات البينية", path: "/finance/intercompany", icon: ArrowLeftRight },
      ]},
      { label: "الضرائب والتقارير", path: "/finance/tax", icon: Scale, module: "finance", children: [
        { label: "نظام الضرائب", path: "/finance/tax", icon: Scale },
        { label: "رموز الضريبة", path: "/finance/tax-codes", icon: Percent },
        { label: "قواعد التسعير", path: "/finance/pricing-rules", icon: Percent },
        { label: "فئات WHT", path: "/finance/wht-categories", icon: Percent },
        { label: "تقويم الإقرارات", path: "/finance/tax-filing-calendar", icon: Calendar },
        { label: "جاهزية ZATCA", path: "/finance/vat-filing-readiness", icon: FileCheck },
        { label: "ZATCA Reports Hub", path: "/finance/reports/zatca", icon: FileCheck },
        { label: "تسوية VAT", path: "/finance/reports/vat-reconciliation", icon: Scale },
        { label: "ملخص WHT", path: "/finance/reports/wht-summary", icon: Percent },
        { label: "إعداد إقرار WHT", path: "/finance/wht-filing-workbench", icon: FileCheck },
        { label: "التقارير المالية", path: "/finance/reports", icon: FileBarChart },
        { label: "P&L مقابل الميزانية", path: "/finance/reports/is-vs-budget", icon: Scale },
        { label: "اتجاه قائمة الدخل", path: "/finance/reports/is-trend", icon: TrendingUp },
        { label: "قائمة التدفقات النقدية", path: "/finance/reports/cash-flow-statement", icon: Banknote },
        { label: "Y/Y Comparison", path: "/finance/reports/yoy", icon: BarChart2 },
        { label: "معدل الحرق", path: "/finance/expense-burn-rate", icon: Activity },
        { label: "GL Health Score", path: "/finance/gl-health", icon: ShieldAlert },
        { label: "محفظة ربحية المشاريع", path: "/finance/project-portfolio", icon: BarChart2 },
        { label: "محفظة ربحية العقارات", path: "/finance/property-portfolio", icon: BarChart2 },
        { label: "محفظة ربحية وكلاء العمرة", path: "/finance/umrah-agent-portfolio", icon: BarChart2 },
        { label: "محفظة مجموعات العمرة", path: "/finance/umrah-group-portfolio", icon: BarChart2 },
        { label: "محفظة مواسم العمرة", path: "/finance/umrah-season-portfolio", icon: BarChart2 },
        { label: "محلّل مزيج الإيرادات", path: "/finance/revenue-mix", icon: TrendingUp },
        { label: "محلّل مزيج المصاريف", path: "/finance/expense-mix", icon: TrendingUp },
        { label: "اتجاه DSO للسيولة", path: "/finance/reports/dso-trend", icon: Activity },
      ]},
      { label: "صناديق الواردات", path: "/finance/approvals-inbox", icon: Bell, module: "finance", children: [
        { label: "Approvals Inbox", path: "/finance/approvals-inbox", icon: Bell },
        { label: "ملف الجهة 360°", path: "/finance/entity-360", icon: Sparkles },
        { label: "ترتيب الجهات", path: "/finance/entity-ranking", icon: BarChart3 },
        { label: "الجهات الخاملة", path: "/finance/dormant-entities", icon: Clock },
        { label: "GL Integrity Gaps", path: "/finance/reports/gl-integrity-gaps", icon: AlertTriangle },
        { label: "Unmapped Lines", path: "/finance/reports/unmapped-lines", icon: AlertTriangle },
        { label: "Posting Activity", path: "/finance/journal/activity", icon: Activity },
      ]},
      // محرك التوجيه المحاسبي — صفحات Line-Level Allocation cluster (PRs 1291,
      // 1297, 1304, 1307, 1309, 1311). الترابط بينها مكتمل عبر AllocationTabsNav
      // و AllocationHealthCard، وهذا المدخل في القائمة الجانبية يخلي الكلستر
      // قابلاً للوصول من أي صفحة في النظام (ليس من finance فقط).
      { label: "محرك التوجيه المحاسبي", path: "/finance/settings", icon: Network, module: "finance", children: [
        { label: "مركز الإعدادات", path: "/finance/settings", icon: Settings },
        { label: "قواعد التوجيه", path: "/finance/allocation-rules", icon: Network },
        { label: "التوجيه البُعدي", path: "/finance/dimensional-routing", icon: Network },
        { label: "كتالوج المنتجات", path: "/finance/product-catalog", icon: Package },
        { label: "تشخيص التغطية", path: "/finance/allocation-coverage", icon: Target },
        { label: "سجل التوجيه", path: "/finance/allocation-results", icon: Activity },
        { label: "التعديلات اليدوية", path: "/finance/overrides-report", icon: BookOpen },
        { label: "تجاوزات الإلزام", path: "/finance/allocation-override-log", icon: ShieldAlert },
      ]},
      { label: "ارتباطات الموظفين", path: "/finance/salary-advances", icon: DollarSign, module: "finance", children: [
        { label: "سلف الرواتب", path: "/finance/salary-advances", icon: DollarSign },
        { label: "الطلبات المالية", path: "/finance/financial-requests", icon: ClipboardCheck },
      ]},
      // F6 (audit) — التحصيل والديون المعدومة كانت موجودة كصفحات لكن غير
      // مرتبطة بالـsidebar؛ مجمَّعة هنا الآن في مدخل واحد لتسهيل الوصول.
      { label: "التحصيل والديون", path: "/finance/collections", icon: AlertTriangle, module: "finance", children: [
        { label: "منضدة التحصيل", path: "/finance/ar-collection-workbench", icon: DollarSign },
        { label: "تقادم الذمم", path: "/finance/ar-aging", icon: Clock },
        { label: "متابعة Dunning", path: "/finance/dunning", icon: Bell },
        { label: "مراحل التصعيد", path: "/finance/collection", icon: AlertTriangle },
        { label: "الديون المشكوك بها", path: "/finance/bad-debt-provision", icon: ShieldAlert },
        { label: "الديون المعدومة", path: "/finance/bad-debt", icon: ShieldAlert },
      ]},
      // F6 (audit) — العملات الأجنبية: rates + revaluation + history في
      // مجموعة واحدة بدلاً من تركها كلها off-sidebar.
      { label: "العملات الأجنبية (FX)", path: "/finance/fx-rates", icon: Globe, module: "finance", children: [
        { label: "أسعار الصرف", path: "/finance/fx-rates", icon: Globe },
        { label: "إعادة التقييم", path: "/finance/fx-revaluation", icon: RefreshCw },
        { label: "سجل إعادة التقييم", path: "/finance/fx-revaluation/history", icon: Activity },
      ]},
      // F6 (audit) — تقارير المخزون والمحاسبية المتقدمة (CoGS، تقييم،
      // دوران، صلاحيات، مخزون سالب) كلها تحت /finance/reports/* لكن لم
      // يكن لها مدخل sidebar — مرئية الآن في مجموعة واحدة.
      { label: "تقارير محاسبية متقدمة", path: "/finance/reports", icon: FileBarChart, module: "finance", children: [
        { label: "ملخص التكلفة (CoGS)", path: "/finance/reports/cogs-summary", icon: TrendingDown2 },
        { label: "تقييم المخزون", path: "/finance/reports/inventory-valuation", icon: Package },
        { label: "دوران المخزون", path: "/finance/reports/inventory-turnover", icon: RefreshCw },
        { label: "تنبيهات صلاحية الدفعات", path: "/finance/reports/lot-expiry-alerts", icon: AlertTriangle },
        { label: "مخزون سالب", path: "/finance/reports/negative-stock", icon: AlertTriangle },
        { label: "انحرافات الميزانية", path: "/finance/budget-variance", icon: BarChart3 },
        { label: "اعتماد الميزانية", path: "/finance/budget-approvals", icon: ClipboardCheck },
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
        { label: "المخاطر", path: "/projects/risks", icon: ShieldAlert },
        { label: "مهام المشاريع", path: "/projects/tasks", icon: ListTodo },
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
      { label: "إدارة الأسطول", path: "/fleet", icon: Truck, module: "fleet", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        { label: "لوحة التحكم", path: "/module-dashboards?tab=fleet", icon: LayoutDashboard, module: "bi" },
        { label: "السائقين", path: "/fleet/drivers", icon: User },
        { label: "الرحلات", path: "/fleet/trips", icon: Navigation },
        { label: "الصيانة", path: "/fleet/maintenance", icon: Wrench },
        { label: "استهلاك الوقود", path: "/fleet/fuel", icon: Fuel },
        { label: "التأمين", path: "/fleet/insurance", icon: Shield },
        { label: "التنبيهات", path: "/fleet/alerts", icon: Bell },
        { label: "خطط الصيانة الوقائية", path: "/fleet/preventive-plans", icon: CalendarClock },
        { label: "مخالفات المرور", path: "/fleet/traffic-violations", icon: AlertTriangle },
        { label: "التتبع المباشر", path: "/fleet/telematics/live-map", icon: Satellite },
        { label: "تنبيهات السلامة الذكية", path: "/fleet/telematics/ai-alerts", icon: Bot },
        { label: "بطاقة أداء السائقين", path: "/fleet/telematics/scorecard", icon: Award },
        { label: "قراءات الحساسات", path: "/fleet/telematics/sensors", icon: Activity },
        { label: "أرشيف الأدلة", path: "/fleet/telematics/evidence", icon: Archive },
        { label: "أدلة الفيديو", path: "/fleet/telematics/video-evidence", icon: VideoIcon },
        { label: "أجهزة MDVR", path: "/fleet/telematics/devices", icon: HardDrive },
        { label: "إعدادات CMSV6", path: "/fleet/telematics/settings", icon: Settings },
        { label: "لوحة التشغيل", path: "/fleet/telematics/operations", icon: ShieldAlert },
        { label: "تكلفة الملكية (TCO)", path: "/fleet/tco", icon: DollarSign },
        { label: "التقارير", path: "/fleet/reports", icon: FileBarChart },
        { label: "الشحن والبضائع", path: "/fleet/cargo", icon: Package },
        { label: "نظام التتبع (Telematics)", path: "/fleet/telematics", icon: Satellite },
        { label: "الإطارات", path: "/fleet/tires", icon: Settings },
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
        // Agent-5: explicit module="bi" matches backend gate.
        { label: "لوحة التحكم", path: "/module-dashboards?tab=warehouse", icon: LayoutDashboard, module: "bi" },
        { label: "حركات المخزون", path: "/warehouse/movements", icon: Activity },
        { label: "الفئات", path: "/warehouse/categories", icon: FolderOpen },
        { label: "الموردين", path: "/warehouse/suppliers", icon: Users },
        { label: "جرد المخزون", path: "/warehouse/inventory-count", icon: ClipboardCheck },
        { label: "عمليات متقدّمة (دفعات/تسلسلات/ABC)", path: "/warehouse/advanced", icon: BarChart3 },
      ]},
      { label: "المتجر", path: "/store", icon: ShoppingCart, module: "store", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        { label: "لوحة التحكم", path: "/module-dashboards?tab=store", icon: LayoutDashboard, module: "bi" },
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
        { label: "نظرة عامة", path: "/properties/dashboard", icon: LayoutDashboard },
        { label: "المباني والمجمعات", path: "/properties/buildings", icon: Building2 },
        { label: "الوحدات العقارية", path: "/properties", icon: Building },
        { label: "المستأجرون", path: "/properties/tenants", icon: Users2 },
        { label: "الملاك", path: "/properties/owners", icon: User },
        { label: "كشف حساب المالك", path: "/properties/owners/statement", icon: FileBarChart },
        { label: "عقود الإيجار", path: "/properties/contracts", icon: FileSignature },
        { label: "المدفوعات", path: "/properties/payments", icon: Banknote },
        { label: "طلبات الصيانة", path: "/properties/maintenance", icon: Hammer },
        { label: "الفحص والتفتيش", path: "/properties/inspections", icon: ClipboardCheck },
        { label: "ودائع الضمان", path: "/properties/deposits", icon: Banknote },
        { label: "تقرير الإشغال", path: "/properties/occupancy-report", icon: BarChart3 },
        { label: "دليل العقارات", path: "/properties/guide", icon: BookOpen },
        { label: "دليل إرشادي مصور", path: "/guide/properties", icon: BookOpen },
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
        { label: "لوحة التشغيل", path: "/umrah", icon: LayoutDashboard },
        { label: "المعتمرين", path: "/umrah/pilgrims", icon: Users },
        { label: "الوكلاء الرئيسيين", path: "/umrah/agents", icon: Building2 },
        { label: "الوكلاء الفرعيين", path: "/umrah/sub-agents", icon: Users },
        { label: "المواسم", path: "/umrah/seasons", icon: Calendar },
        { label: "الباقات", path: "/umrah/packages", icon: Package },
        { label: "المجموعات", path: "/umrah/groups", icon: Users2 },
        { label: "التسعير", path: "/umrah/pricing", icon: DollarSign },
        { label: "خطط العمولات", path: "/umrah/commission-plans", icon: TrendingUp },
        { label: "حساب العمولات", path: "/umrah/commission-calculations", icon: Calculator },
        { label: "الفواتير", path: "/umrah/invoices", icon: Receipt },
        { label: "المدفوعات", path: "/umrah/payments", icon: Banknote },
        { label: "معالج المبيعات", path: "/umrah/sales-wizard", icon: Sparkles },
        { label: "الغرامات", path: "/umrah/penalties", icon: AlertTriangle },
        { label: "المخالفات النظامية", path: "/umrah/violations", icon: Shield },
        { label: "النقل والمواصلات", path: "/umrah/transport", icon: Truck },
        { label: "البرنامج اليومي", path: "/umrah/daily-runsheet", icon: Calendar },
        { label: "التسوية والمطابقة", path: "/umrah/reconciliation", icon: RefreshCw },
        { label: "المرفقات", path: "/umrah/attachments", icon: Paperclip },
        { label: "استيراد البيانات", path: "/umrah/import", icon: FileText },
        { label: "السكن والإقامة", path: "/umrah/accommodations", icon: Home },
        { label: "المعتمرون المعفون", path: "/umrah/exempt-pilgrims", icon: Users },
        { label: "الامتثال", path: "/umrah/compliance", icon: FileCheck },
        { label: "الإعدادات", path: "/umrah/settings", icon: Settings },
        { label: "التقارير", path: "/umrah/reports", icon: FileBarChart, children: [
          { label: "أرصدة الوكلاء", path: "/umrah/reports/agent-balances", icon: DollarSign },
          { label: "أرصدة الوكلاء الفرعيين", path: "/umrah/reports/subagent-balances", icon: DollarSign },
          { label: "حركات المعتمرين", path: "/umrah/reports/pilgrim-movements", icon: Activity },
        ]},
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
        { label: "لوحة التحكم", path: "/module-dashboards?tab=crm", icon: LayoutDashboard, module: "bi" },
        { label: "الفرص التجارية", path: "/crm", icon: Target },
        { label: "قمع المبيعات", path: "/crm/pipeline", icon: TrendingUp },
        { label: "أنشطة علاقات العملاء", path: "/crm/activities", icon: Activity },
      ]},
      { label: "الدعم الفني", path: "/support", icon: Headphones, module: "support", children: [
        // Agent-5: explicit module="bi" matches backend gate.
        { label: "لوحة التحكم", path: "/module-dashboards?tab=support", icon: LayoutDashboard, module: "bi" },
        { label: "التذاكر", path: "/support", icon: Headphones },
        { label: "قاعدة المعرفة", path: "/support/kb", icon: BookOpen },
        { label: "الردود الجاهزة", path: "/support/replies", icon: MessageSquare },
      ]},
      { label: "التسويق", path: "/marketing", icon: Megaphone, module: "marketing" },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 7. الإدارة والحوكمة (من اليومي → الرسمي → الامتثال)
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الإدارة والحوكمة",
    items: [
      { label: "مركز الطلبات", path: "/requests", icon: ClipboardCheck, module: "requests", children: [
        { label: "تقديم طلب", path: "/requests", icon: ClipboardCheck },
        { label: "أنواع الطلبات", path: "/requests/types", icon: ListTodo },
        { label: "سير العمل", path: "/requests/workflows", icon: GitBranch },
      ]},
      { label: "المستندات", path: "/documents", icon: FileText, module: "documents", children: [
        { label: "جميع المستندات", path: "/documents", icon: FileText },
        { label: "المجلدات", path: "/documents/folders", icon: FolderOpen },
        { label: "الأرشيف", path: "/documents/archive", icon: Archive },
        { label: "صندوق OCR", path: "/documents/ocr-inbox", icon: FileText },
        { label: "القوالب", path: "/documents/templates", icon: FilePlus },
        { label: "رفع مستند", path: "/documents/upload", icon: FilePlus },
      ]},
      { label: "التواصل", path: "/inbox", icon: Mail, module: "comms", children: [
        { label: "صندوقي الموحّد", path: "/inbox", icon: Mail },
        { label: "الصناديق المتصلة", path: "/mailboxes", icon: Send },
        { label: "الصادر والوارد", path: "/correspondence", icon: FileText },
        // Phase 5: communications dashboard is admin-only — non-managers
        // get redirected to /inbox automatically. Sidebar hides it for
        // them via minRoleLevel.
        { label: "مراقبة الاتصالات", path: "/communications", icon: MessageSquare, minRoleLevel: 40 },
        { label: "محرك الإشعارات", path: "/communications/notification-engine", icon: Zap, minRoleLevel: 40 },
      ]},
      { label: "الشؤون القانونية", path: "/legal/cases", icon: Scale, module: "legal", minRoleLevel: 40, children: [
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
        { label: "المخاطر", path: "/governance/risks", icon: AlertTriangle },
        { label: "التدقيق", path: "/governance/audits", icon: ClipboardCheck },
        { label: "الامتثال", path: "/governance/compliance", icon: CheckCircle },
        { label: "الإجراءات التصحيحية", path: "/governance/capa", icon: Wrench },
      ]},
      { label: "الإقفال اليومي", path: "/daily-close", icon: CheckSquare, minRoleLevel: 40 },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 8. النظام
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "النظام",
    items: [
      { label: "ذكاء الأعمال", path: "/bi", icon: LineChart, module: "bi", minRoleLevel: 40, children: [
        { label: "لوحة التحليلات", path: "/bi", icon: LineChart },
        { label: "تحليل الأداء", path: "/bi/operations", icon: Activity },
        { label: "التقارير الإدارية", path: "/bi/admin-reports", icon: FileBarChart },
        { label: "مؤشرات الأداء", path: "/bi/kpis", icon: TrendingUp },
        { label: "التقارير التحليلية", path: "/bi/reports", icon: FileBarChart },
        { label: "لوحات BI", path: "/bi/dashboards", icon: LayoutDashboard },
        { label: "الرؤى الذكية", path: "/insights", icon: Sparkles },
        { label: "لوحة الذكاء", path: "/intelligence", icon: Brain },
        { label: "منصة AI", path: "/intelligence/ai-workbench", icon: Sparkles },
      ]},
      // 17-item "مدير النظام" was one flat list — broke into 4 themed
      // sub-groups so an admin can find a specific tool without scanning
      // the whole list. Order: identity first, then ops, then integrations,
      // then audit trails.
      { label: "مدير النظام", path: "/admin", icon: Shield, module: "admin", minRoleLevel: 90, children: [
        { label: "المستخدمين والصلاحيات", path: "/admin/users", icon: KeyRound, children: [
          { label: "المستخدمين", path: "/admin/users", icon: Users, perm: ["admin:list", "admin:update"], permMode: "any" },
          { label: "إنشاء سريع وصلاحيات", path: "/admin/user-onboarding", icon: UserPlus, perm: ["admin:update"], permMode: "any" },
          { label: "الأدوار والصلاحيات (v2)", path: "/admin", icon: KeyRound, perm: ["admin.roles:view", "admin.roles:update"], permMode: "any" },
          { label: "مصفوفة الأدوار", path: "/admin/rbac-matrix", icon: Shield, perm: "admin.roles:view" },
          { label: "الصلاحيات المبسّطة", path: "/admin/roles-simple", icon: Shield, perm: "admin.roles:update" },
          { label: "الأدوار (الكلاسيكي)", path: "/admin/roles", icon: KeyRound, perm: ["admin.roles:view", "admin.roles:update"], permMode: "any" },
        ]},
        { label: "المراقبة والمتابعة", path: "/admin/monitoring", icon: Activity, children: [
          { label: "مركز المراقبة", path: "/admin/monitoring", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "الوثائق الحكومية المنتهية", path: "/admin/expiring-docs", icon: Clock, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "مرصد المراقبة الموحّد", path: "/admin/observability", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "خارطة #1139 الحيّة", path: "/admin/master-plan", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "تقرير المخالفات", path: "/admin/violations-report", icon: AlertTriangle, perm: ["hr:approve", "admin:view"], permMode: "any" },
          { label: "مراقبة الأحداث", path: "/admin/event-monitor", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "مراقبة دورة الحياة", path: "/admin/lifecycle-monitor", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "حاكم النظام", path: "/admin/system-governor", icon: Shield, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "سجل الكيانات", path: "/admin/system-registry", icon: Network, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "سجل النطاقات", path: "/admin/domain-registry", icon: Network, perm: ["admin:list", "admin:view"], permMode: "any" },
        ]},
        { label: "السياسات والحوكمة", path: "/admin/policy-engine", icon: Shield, children: [
          { label: "محرك السياسات", path: "/admin/policy-engine", icon: Shield, perm: "admin:update" },
          { label: "تجاوزات الموافقات", path: "/admin/approval-overrides", icon: Bell, perm: "admin:update" },
          { label: "حماية البيانات (PDPL)", path: "/admin/pdpl", icon: Shield, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "التوقيع الرقمي", path: "/admin/digital-signature", icon: FileSignature, perm: ["admin:list", "admin:view"], permMode: "any" },
        ]},
        { label: "تشخيص محاسبي", path: "/admin/gl-reconciliation", icon: ShieldAlert, children: [
          { label: "تسوية GL", path: "/admin/gl-reconciliation", icon: ShieldAlert, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "إخفاقات الترحيل", path: "/admin/posting-failures", icon: AlertTriangle, perm: ["admin:list", "admin:view"], permMode: "any" },
        ]},
        { label: "التكاملات والاتصالات", path: "/admin/integrations", icon: Mail, children: [
          { label: "مركز التكاملات", path: "/admin/integrations", icon: Mail, perm: "admin:update" },
          { label: "مركز التحكّم بالاتصالات", path: "/admin/communication-control", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "مركز التحكّم بالـ PBX", path: "/admin/pbx-control", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "توجيه الإشعارات", path: "/admin/notification-routing", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "إعدادات المزوّدات", path: "/admin/vendor-settings", icon: Activity, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "تشخيص التكاملات", path: "/admin/integrations-diagnostics", icon: Activity, perm: "admin:update" },
          { label: "مراجعات ZATCA", path: "/admin/zatca-audits", icon: ShieldAlert, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "حوكمة الذكاء الاصطناعي", path: "/admin/ai-governance", icon: Brain, perm: ["admin:list", "admin:view"], permMode: "any" },
          { label: "مختبر الذكاء", path: "/admin/intelligence-playground", icon: Brain, perm: "admin:update" },
          { label: "استيراد البيانات", path: "/admin/data-import", icon: FilePlus, perm: "admin:update" },
        ]},
        { label: "سجلات التدقيق", path: "/admin/logs", icon: ScrollText, children: [
          { label: "سجل المراجعة", path: "/admin/logs", icon: ScrollText, perm: ["audit:read", "admin:read"], permMode: "any" },
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
      { label: "الطباعة والمطبوعات", path: "/reports/print-log", icon: Printer, minRoleLevel: 40, children: [
        { label: "سجل المطبوعات", path: "/reports/print-log", icon: Printer, module: "bi", minRoleLevel: 40, perm: "print_jobs:read" },
        { label: "موافقات إعادة الطباعة", path: "/manager-board/reprint-approvals", icon: Printer, minRoleLevel: 40, perm: "print:reprint:approve" },
        { label: "قوالب الطباعة", path: "/settings/print-templates", icon: Printer, module: "settings", minRoleLevel: 70, perm: "templates:read" },
        { label: "قوالب الطباعة (admin)", path: "/admin/print-templates", icon: Printer, module: "admin", minRoleLevel: 90, perm: ["admin:list", "admin:view"], permMode: "any" },
        { label: "تشخيص الطباعة", path: "/admin/print-diagnostics", icon: Printer, module: "admin", minRoleLevel: 90, perm: ["admin:list", "admin:view"], permMode: "any" },
      ]},
      { label: "الإعدادات", path: "/settings", icon: Cog, module: "settings", minRoleLevel: 70, children: [
        { label: "عام", path: "/settings", icon: Cog },
        { label: "الفروع", path: "/settings/branches", icon: Building, perm: "settings:write" },
        { label: "الشركات", path: "/settings/companies", icon: Building2, perm: "settings:write" },
        { label: "الأقسام", path: "/settings/departments", icon: Network, perm: "settings:write" },
        { label: "قواعد الأعمال", path: "/settings/rules", icon: Zap, perm: "settings:write" },
        { label: "سجل المراجعة", path: "/settings/audit-log", icon: ScrollText, perm: ["audit:read", "settings:write"], permMode: "any" },
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
