import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAppContext, roleKeyColors, ModuleType } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  LayoutDashboard, Users, Building2, CreditCard, FileText, Truck, Home, Banknote,
  Shield, ChevronDown, ChevronLeft, Clock, Calendar, DollarSign, GraduationCap,
  Target, Network, Receipt, Wallet, Car, Wrench, Fuel, User,
  FileCheck, AlertTriangle, ClipboardCheck, Building, FileSignature, Users2,
  Hammer, TrendingUp, FileBarChart, FolderOpen, Archive, ListTodo, GitBranch,
  FilePlus, CalendarClock, ScrollText, Cog, Bell, Mail,
  MessageSquare, Scale, Briefcase, Megaphone, ShoppingCart, Package, Activity,
  LineChart, Menu, X, LogOut, Headphones, CheckCircle,
  KeyRound, CloudRain, MapPin, QrCode, FileSignature as FileSignature2,
  BarChart3, UserPlus, ClipboardList, Navigation, Percent, Zap,
  Sparkles, Brain, Search, ArrowLeftRight,
  Plus, Printer, CheckSquare, Download, Send, Star, Settings, BookOpen, Radar, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { apiFetch, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { PolicyBanner } from "@/components/policy-banner";
import { useKeyboardShortcuts, usePropertyKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
// CommandPalette is only mounted when the user opens it (Cmd+K or the
// header button). Lazy-load it so its ~345 lines + icons don't ship in
// the initial bundle.
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({ default: m.CommandPalette }))
);

interface NavItem {
  label: string;
  path: string;
  icon: any;
  module?: ModuleType;
  subKey?: string;
  minRoleLevel?: number;
  children?: NavItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const allNavSections: NavSection[] = [
  // ══════════════════════════════════════════════════════════════════════
  // 1. الرئيسية
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الرئيسية",
    items: [
      { label: "لوحة التحكم", path: "/dashboard", icon: LayoutDashboard, module: "home" },
      { label: "مساحتي", path: "/my-space", icon: User },
      { label: "مركز القرارات", path: "/action-center", icon: Briefcase, minRoleLevel: 20 },
      { label: "لوحة المدير", path: "/manager-board", icon: Users, minRoleLevel: 40 },
      { label: "مركز العمليات", path: "/operations-center", icon: Zap, minRoleLevel: 40 },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 2. بوابة الموظف
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "بوابة الموظف",
    items: [
      { label: "طلباتي", path: "/my-requests", icon: ClipboardCheck },
      { label: "طلب إجازة", path: "/my-leave-request", icon: Calendar },
      { label: "حضوري وانصرافي", path: "/my-attendance", icon: Clock },
      { label: "كشف راتبي", path: "/my-payslip", icon: DollarSign },
      { label: "سلفي", path: "/my-loans", icon: Wallet },
      { label: "ساعاتي الإضافية", path: "/my-overtime", icon: Timer },
      { label: "تقييمي", path: "/my-performance", icon: Target },
      { label: "مستنداتي", path: "/my-documents", icon: FileText },
      { label: "إشعاراتي", path: "/notifications", icon: Bell },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 3. الموارد البشرية
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الموارد البشرية",
    items: [
      { label: "لوحة الموارد البشرية", path: "/module-dashboards?tab=hr", icon: LayoutDashboard, module: "hr" },
      { label: "الموظفون", path: "/employees", icon: Users, module: "hr", children: [
        { label: "قائمة الموظفين", path: "/employees", icon: Users, subKey: "employees" },
        { label: "تفعيل الموظفين", path: "/hr/employee-activation", icon: UserPlus, subKey: "employees" },
        { label: "مراجعة التعيين", path: "/hr/onboarding-review", icon: ClipboardCheck, subKey: "employees" },
        { label: "نقل الموظفين", path: "/hr/transfers", icon: ArrowLeftRight, subKey: "employees" },
        { label: "نهاية الخدمة", path: "/hr/exit", icon: LogOut, subKey: "employees" },
        { label: "الوثائق المنتهية", path: "/hr/expiring-documents", icon: AlertTriangle, subKey: "employees" },
        { label: "الهيكل التنظيمي", path: "/hr/organization", icon: Network, subKey: "organization" },
        { label: "الهيكل المصوّر", path: "/hr/organization/structure", icon: GitBranch, subKey: "organization" },
      ]},
      { label: "الحضور والانصراف", path: "/hr/attendance", icon: Clock, module: "hr", children: [
        { label: "السجل اليومي", path: "/hr/attendance", icon: Clock, subKey: "attendance" },
        { label: "تقارير الحضور", path: "/hr/attendance/reports", icon: BarChart3, subKey: "attendance" },
        { label: "التتبع الميداني", path: "/hr/attendance/field-tracking", icon: MapPin, subKey: "attendance" },
        { label: "تسجيل بالرمز المصوّر", path: "/hr/attendance/qr-scanner", icon: QrCode, subKey: "attendance" },
        { label: "الوقت الإضافي", path: "/hr/overtime", icon: Timer, subKey: "attendance" },
        { label: "طلبات الأعذار", path: "/hr/excuse-requests", icon: ClipboardCheck, subKey: "attendance" },
      ]},
      { label: "الإجازات", path: "/hr/leaves", icon: Calendar, module: "hr", children: [
        { label: "طلبات الإجازة", path: "/hr/leaves", icon: Calendar, subKey: "leaves" },
        { label: "إدارة الإجازات", path: "/hr/leaves/management", icon: ClipboardList, subKey: "leaves" },
        { label: "سلاسل الموافقات", path: "/hr/leaves/approval-chains", icon: GitBranch, subKey: "leaves" },
        { label: "الإجازات الرسمية", path: "/hr/public-holidays", icon: CalendarClock, subKey: "leaves" },
      ]},
      { label: "الورديات", path: "/hr/shifts", icon: CalendarClock, module: "hr", children: [
        { label: "جدول الورديات", path: "/hr/shifts", icon: CalendarClock, subKey: "shifts" },
        { label: "إدارة الورديات", path: "/hr/shifts/management", icon: Cog, subKey: "shifts" },
      ]},
      { label: "الرواتب والمستحقات", path: "/hr/payroll", icon: DollarSign, module: "hr", children: [
        { label: "مسيرات الرواتب", path: "/hr/payroll", icon: DollarSign, subKey: "payroll" },
        { label: "مكونات الرواتب", path: "/hr/payroll/salary-components", icon: Percent, subKey: "payroll" },
        { label: "سلف الموظفين", path: "/hr/loans", icon: Wallet, subKey: "payroll" },
        { label: "مكافأة نهاية الخدمة", path: "/hr/gratuity", icon: Banknote, subKey: "payroll" },
      ]},
      { label: "الانضباط والمخالفات", path: "/hr/violations", icon: Scale, module: "hr", children: [
        { label: "المخالفات", path: "/hr/violations", icon: AlertTriangle, subKey: "violations" },
        { label: "إدارة المخالفات", path: "/hr/violations/management", icon: ClipboardList, subKey: "violations" },
        { label: "تصعيد العقوبات", path: "/hr/violations/penalty-escalation", icon: TrendingUp, subKey: "violations" },
        { label: "الرصد التلقائي", path: "/hr/violations/auto-detection", icon: Radar, subKey: "violations" },
        { label: "محاضر الاستفسار", path: "/hr/discipline/memos", icon: FileText, subKey: "violations" },
        { label: "لائحة الانضباط", path: "/hr/discipline/regulation", icon: ScrollText, subKey: "violations" },
      ]},
      { label: "الأداء والتطوير", path: "/hr/performance", icon: Target, module: "hr", children: [
        { label: "تقييم الأداء", path: "/hr/performance", icon: Target, subKey: "performance" },
        { label: "التقييم المتقدم", path: "/hr/performance/advanced", icon: BarChart3, subKey: "performance" },
        { label: "التقييم 360°", path: "/hr/evaluation-360", icon: Activity, subKey: "performance" },
        { label: "خطط التطوير", path: "/hr/development-plans", icon: TrendingUp, subKey: "performance" },
        { label: "خطط التطوير الفردية", path: "/hr/idp", icon: BookOpen, subKey: "performance" },
        { label: "تقرير الدوران", path: "/hr/turnover-report", icon: FileBarChart, subKey: "performance" },
      ]},
      { label: "التدريب", path: "/hr/training", icon: GraduationCap, module: "hr", children: [
        { label: "البرامج التدريبية", path: "/hr/training", icon: GraduationCap, subKey: "training" },
        { label: "التدريب المتقدم", path: "/hr/training/advanced", icon: BarChart3, subKey: "training" },
      ]},
      { label: "التوظيف", path: "/hr/recruitment", icon: Briefcase, module: "hr", children: [
        { label: "الوظائف", path: "/hr/recruitment", icon: Briefcase, subKey: "recruitment" },
        { label: "التوظيف المتقدم", path: "/hr/recruitment/advanced", icon: BarChart3, subKey: "recruitment" },
        { label: "المتقدمين", path: "/hr/recruitment/applications", icon: Users2, subKey: "recruitment" },
      ]},
      { label: "الخطابات الرسمية", path: "/hr/official-letters", icon: FileSignature2, module: "hr", subKey: "employees" },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 4. المالية والمحاسبة
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "المالية والمحاسبة",
    items: [
      { label: "الحسابات والقيود", path: "/finance/accounts", icon: GitBranch, module: "finance", children: [
        { label: "شجرة الحسابات", path: "/finance/accounts", icon: GitBranch },
        { label: "القيود اليومية", path: "/finance/journal", icon: ScrollText },
        { label: "القيود اليدوية", path: "/finance/journal-manual", icon: FileSignature },
        { label: "قيود دورية", path: "/finance/recurring-journals", icon: CalendarClock },
        { label: "أرصدة افتتاحية", path: "/finance/opening-balances", icon: FilePlus },
      ]},
      { label: "الفواتير والسندات", path: "/finance/invoices", icon: Receipt, module: "finance", children: [
        { label: "الفواتير", path: "/finance/invoices", icon: Receipt },
        { label: "السندات", path: "/finance/vouchers", icon: FileText },
        { label: "المصروفات", path: "/finance/expenses", icon: Wallet },
        { label: "المقبوضات", path: "/finance/receivables", icon: DollarSign },
        { label: "المدفوعات", path: "/finance/payments", icon: Wallet },
      ]},
      { label: "المشتريات والموردين", path: "/finance/purchase-orders", icon: ShoppingCart, module: "finance", children: [
        { label: "طلبات الشراء", path: "/finance/purchase-orders", icon: ShoppingCart },
        { label: "الموردين", path: "/finance/vendors", icon: Users },
      ]},
      { label: "النقد والذمم", path: "/finance/treasury", icon: Building, module: "finance", children: [
        { label: "الخزينة", path: "/finance/treasury", icon: Wallet },
        { label: "التسوية البنكية", path: "/finance/bank-reconciliation", icon: Building },
        { label: "تقادم الذمم المدينة", path: "/finance/ar-aging", icon: Clock },
        { label: "تقادم الذمم الدائنة", path: "/finance/ap-aging", icon: Clock },
        { label: "لوحة التدفق النقدي", path: "/finance/cashflow", icon: LineChart },
        { label: "توقعات التدفق النقدي", path: "/finance/cash-flow-forecast", icon: TrendingUp },
      ]},
      { label: "الأصول والعهد", path: "/finance/fixed-assets", icon: Building2, module: "finance", children: [
        { label: "الأصول الثابتة", path: "/finance/fixed-assets", icon: Building2 },
        { label: "العهد", path: "/finance/custodies", icon: KeyRound },
      ]},
      { label: "الفترات والميزانية", path: "/finance/budget", icon: FileBarChart, module: "finance", children: [
        { label: "الميزانية", path: "/finance/budget", icon: FileBarChart },
        { label: "الفترات المالية", path: "/finance/fiscal-periods", icon: Calendar },
        { label: "إقفال السنة المالية", path: "/finance/year-end-close", icon: Archive },
      ]},
      { label: "الالتزامات والضمانات", path: "/finance/commitments", icon: FileSignature, module: "finance", children: [
        { label: "الالتزامات", path: "/finance/commitments", icon: FileSignature },
        { label: "الضمانات البنكية", path: "/finance/bank-guarantees", icon: Shield },
      ]},
      { label: "التكاليف والتسويات", path: "/finance/project-costing", icon: FolderOpen, module: "finance", children: [
        { label: "تكاليف المشاريع", path: "/finance/project-costing", icon: FolderOpen },
        { label: "تقييم المخزون", path: "/finance/inventory-costing", icon: Package },
        { label: "المعاملات البينية", path: "/finance/intercompany", icon: ArrowLeftRight },
      ]},
      { label: "الضرائب والتقارير", path: "/finance/tax", icon: Scale, module: "finance", children: [
        { label: "نظام الضرائب", path: "/finance/tax", icon: Scale },
        { label: "التقارير المالية", path: "/finance/reports", icon: FileBarChart },
      ]},
      { label: "ارتباطات الموظفين", path: "/finance/salary-advances", icon: DollarSign, module: "finance", children: [
        { label: "سلف الرواتب", path: "/finance/salary-advances", icon: DollarSign },
        { label: "الطلبات المالية", path: "/finance/financial-requests", icon: ClipboardCheck },
      ]},
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 5. العمليات
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "العمليات",
    items: [
      { label: "المشاريع والمهام", path: "/projects", icon: Activity, module: "operations", children: [
        { label: "لوحة التحكم", path: "/module-dashboards?tab=projects", icon: LayoutDashboard },
        { label: "قائمة المشاريع", path: "/projects", icon: Target },
        { label: "المهام", path: "/tasks", icon: ListTodo },
      ]},
      { label: "إدارة الأسطول", path: "/fleet", icon: Truck, module: "fleet", children: [
        { label: "لوحة التحكم", path: "/module-dashboards?tab=fleet", icon: LayoutDashboard },
        { label: "المركبات", path: "/fleet", icon: Car },
        { label: "السائقين", path: "/fleet/drivers", icon: User },
        { label: "الرحلات", path: "/fleet/trips", icon: Navigation },
        { label: "الصيانة", path: "/fleet/maintenance", icon: Wrench },
        { label: "استهلاك الوقود", path: "/fleet/fuel", icon: Fuel },
        { label: "التأمين", path: "/fleet/insurance", icon: Shield },
        { label: "التنبيهات", path: "/fleet/alerts", icon: Bell },
        { label: "خطط الصيانة الوقائية", path: "/fleet/preventive-plans", icon: CalendarClock },
        { label: "مخالفات المرور", path: "/fleet/traffic-violations", icon: AlertTriangle },
      ]},
      { label: "المستودعات", path: "/warehouse", icon: Package, module: "warehouse", children: [
        { label: "لوحة التحكم", path: "/module-dashboards?tab=warehouse", icon: LayoutDashboard },
        { label: "منتجات المخزون", path: "/warehouse", icon: Package },
        { label: "حركات المخزون", path: "/warehouse/movements", icon: Activity },
        { label: "الفئات", path: "/warehouse/categories", icon: FolderOpen },
        { label: "الموردين", path: "/warehouse/suppliers", icon: Users },
      ]},
      { label: "المتجر", path: "/store", icon: ShoppingCart, module: "store", children: [
        { label: "لوحة التحكم", path: "/module-dashboards?tab=store", icon: LayoutDashboard },
        { label: "منتجات المتجر", path: "/store", icon: Package },
        { label: "الطلبات", path: "/store/orders", icon: ShoppingCart },
      ]},
      { label: "إدارة الأملاك", path: "/properties/dashboard", icon: Home, module: "property", children: [
        { label: "لوحة التحكم", path: "/properties/dashboard", icon: LayoutDashboard },
        { label: "المباني والمجمعات", path: "/properties/buildings", icon: Building2 },
        { label: "الوحدات العقارية", path: "/properties", icon: Building },
        { label: "المستأجرون", path: "/properties/tenants", icon: Users2 },
        { label: "الملاك", path: "/properties/owners", icon: User },
        { label: "عقود الإيجار", path: "/properties/contracts", icon: FileSignature },
        { label: "المدفوعات", path: "/properties/payments", icon: Banknote },
        { label: "طلبات الصيانة", path: "/properties/maintenance", icon: Hammer },
        { label: "الفحص والتفتيش", path: "/properties/inspections", icon: ClipboardCheck },
        { label: "ودائع الضمان", path: "/properties/deposits", icon: Banknote },
        { label: "تقرير الإشغال", path: "/properties/occupancy-report", icon: BarChart3 },
        { label: "دليل إرشادي مصور", path: "/guide/properties", icon: BookOpen },
      ]},
      { label: "إدارة العمرة", path: "/umrah", icon: CloudRain, children: [
        { label: "لوحة التشغيل", path: "/umrah", icon: LayoutDashboard },
        { label: "المعتمرين", path: "/umrah/pilgrims", icon: Users },
        { label: "الوكلاء", path: "/umrah/agents", icon: Building2 },
        { label: "المواسم", path: "/umrah/seasons", icon: Calendar },
        { label: "الغرامات", path: "/umrah/penalties", icon: AlertTriangle },
        { label: "فواتير الوكلاء", path: "/umrah/invoices", icon: Receipt },
        { label: "الباقات", path: "/umrah/packages", icon: Package },
        { label: "النقل والمواصلات", path: "/umrah/transport", icon: Truck },
        { label: "الاستيراد", path: "/umrah/import", icon: FileText },
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
        { label: "لوحة التحكم", path: "/module-dashboards?tab=crm", icon: LayoutDashboard },
        { label: "العملاء", path: "/clients", icon: Building2 },
        { label: "الفرص التجارية", path: "/crm", icon: Target },
        { label: "قمع المبيعات", path: "/crm/pipeline", icon: TrendingUp },
        { label: "أنشطة علاقات العملاء", path: "/crm/activities", icon: Activity },
      ]},
      { label: "الدعم الفني", path: "/support", icon: Headphones, module: "support", children: [
        { label: "لوحة التحكم", path: "/module-dashboards?tab=support", icon: LayoutDashboard },
        { label: "التذاكر", path: "/support", icon: Headphones },
      ]},
      { label: "التسويق", path: "/marketing", icon: Megaphone, module: "marketing" },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════
  // 7. الإدارة والحوكمة
  // ══════════════════════════════════════════════════════════════════════
  {
    title: "الإدارة والحوكمة",
    items: [
      { label: "الإقفال اليومي", path: "/daily-close", icon: Shield, minRoleLevel: 40 },
      { label: "الشؤون القانونية", path: "/legal/cases", icon: Scale, module: "legal", minRoleLevel: 40, children: [
        { label: "القضايا", path: "/legal/cases", icon: Briefcase },
        { label: "العقود القانونية", path: "/legal/contracts", icon: FileSignature },
        { label: "الجلسات القادمة", path: "/legal/sessions", icon: Calendar },
        { label: "الأحكام القضائية", path: "/legal/judgments", icon: CheckCircle },
        { label: "المراسلات", path: "/legal/correspondence", icon: Mail },
      ]},
      { label: "الحوكمة والامتثال", path: "/governance/policies", icon: Shield, module: "governance", minRoleLevel: 60, children: [
        { label: "السياسات", path: "/governance/policies", icon: FileCheck },
        { label: "المخاطر", path: "/governance/risks", icon: AlertTriangle },
        { label: "التدقيق", path: "/governance/audits", icon: ClipboardCheck },
        { label: "الامتثال", path: "/governance/compliance", icon: CheckCircle },
        { label: "الإجراءات التصحيحية", path: "/governance/capa", icon: Wrench },
      ]},
      { label: "مركز الطلبات", path: "/requests", icon: ClipboardCheck, module: "requests", children: [
        { label: "تقديم طلب", path: "/requests", icon: ClipboardCheck },
        { label: "أنواع الطلبات", path: "/requests/types", icon: ListTodo },
        { label: "سير العمل", path: "/requests/workflows", icon: GitBranch },
      ]},
      { label: "المستندات", path: "/documents", icon: FileText, module: "documents", children: [
        { label: "جميع المستندات", path: "/documents", icon: FileText },
        { label: "المجلدات", path: "/documents/folders", icon: FolderOpen },
        { label: "الأرشيف", path: "/documents/archive", icon: Archive },
        { label: "القوالب", path: "/documents/templates", icon: FilePlus },
      ]},
      { label: "التواصل", path: "/communications", icon: Mail, module: "comms", children: [
        { label: "سجل الاتصالات", path: "/communications", icon: MessageSquare },
        { label: "الخطابات والمراسلات", path: "/letters", icon: Mail },
        { label: "محرك الإشعارات", path: "/communications/notification-engine", icon: Zap },
      ]},
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
        { label: "الرؤى الذكية", path: "/insights", icon: Sparkles },
        { label: "لوحة الذكاء", path: "/intelligence", icon: Brain },
      ]},
      { label: "مدير النظام", path: "/admin", icon: Shield, module: "admin", minRoleLevel: 90, children: [
        { label: "المستخدمين", path: "/admin/users", icon: Users },
        { label: "الأدوار والصلاحيات", path: "/admin/roles", icon: KeyRound },
        { label: "مركز التكاملات", path: "/admin/integrations", icon: Mail },
        { label: "مركز المراقبة", path: "/admin/monitoring", icon: Activity },
        { label: "تقرير المخالفات", path: "/admin/violations-report", icon: AlertTriangle },
        { label: "سجل المراجعة", path: "/admin/logs", icon: ScrollText },
        { label: "سجل الحركات", path: "/activity-log", icon: Activity },
        { label: "الإشعارات", path: "/notifications", icon: Bell },
      ]},
      { label: "الإعدادات", path: "/settings", icon: Cog, module: "settings", minRoleLevel: 70, children: [
        { label: "عام", path: "/settings", icon: Cog },
        { label: "الفروع", path: "/settings/branches", icon: Building },
        { label: "الشركات", path: "/settings/companies", icon: Building2 },
        { label: "قواعد الأعمال", path: "/settings/rules", icon: Zap },
      ]},
    ],
  },
];

const allNavItems: NavItem[] = allNavSections.flatMap(s => s.items);

export function getAllNavigationPages(): { label: string; path: string; section: string; parent?: string }[] {
  const pages: { label: string; path: string; section: string; parent?: string }[] = [];

  function collectPages(items: NavItem[], section: string, parentLabel?: string) {
    for (const item of items) {
      if (!item.path.startsWith("#")) {
        pages.push({ label: item.label, path: item.path, section, parent: parentLabel });
      }
      if (item.children) {
        collectPages(item.children, section, parentLabel ? `${parentLabel} / ${item.label}` : item.label);
      }
    }
  }

  for (const section of allNavSections) {
    collectPages(section.items, section.title);
  }
  return pages;
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { logout, user } = useAuth();
  const {
    selectedRole,
    setSelectedRoleKey,
    userRoles,
    selectedRoleLabel,
    selectedRoleColor,
    jobTitle,
    companies,
    selectedCompanyIds,
    setSelectedCompanyIds,
    selectedBranchIds,
    setSelectedBranchIds,
    filteredBranches,
    canAccessModule,
    canAccessSubPage,
    roleLevel,
    effectiveRoleLevel,
    switchToCompany,
  } = useAppContext();
  const { settings: globalSettings } = useSettings();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteFilter, setCommandPaletteFilter] = useState<"shortcuts" | null>(null);

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      description: "لوحة الأوامر",
      action: () => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); },
    },
    {
      key: "n",
      ctrl: true,
      description: "طلب جديد",
      action: () => navigate("/requests"),
    },
    {
      key: "e",
      alt: true,
      description: "الموظفين",
      action: () => navigate("/employees"),
    },
    {
      key: "a",
      alt: true,
      description: "الحضور والانصراف",
      action: () => navigate("/hr/attendance"),
    },
    {
      key: "l",
      alt: true,
      description: "الإجازات",
      action: () => navigate("/hr/leaves"),
    },
    {
      key: "p",
      alt: true,
      description: "الرواتب",
      action: () => navigate("/hr/payroll"),
    },
    {
      key: "/",
      ctrl: true,
      description: "عرض قائمة الاختصارات",
      action: () => { setCommandPaletteFilter("shortcuts"); setCommandPaletteOpen(true); },
    },
    {
      key: "b",
      ctrl: true,
      description: "طي/توسيع القائمة الجانبية",
      action: () => setIsSidebarCollapsed(prev => !prev),
    },
  ]);

  usePropertyKeyboardShortcuts(navigate);

  const filterItems = (items: NavItem[]): NavItem[] =>
    items
      .filter(item => (!item.module || canAccessModule(item.module)) && (!item.minRoleLevel || effectiveRoleLevel >= item.minRoleLevel))
      .map(item => {
        if (!item.children) return item;
        const mod = item.module;
        if (mod) {
          const filteredChildren = item.children.filter(
            child => !child.subKey || canAccessSubPage(mod, child.subKey)
          );
          return filteredChildren.length > 0 ? { ...item, children: filteredChildren } : null;
        }
        return item;
      })
      .filter(Boolean) as NavItem[];

  const filteredSections = allNavSections
    .map(section => ({
      ...section,
      items: filterItems(section.items),
    }))
    .filter(section => section.items.length > 0);

  const filteredNavItems = filteredSections.flatMap(s => s.items);

  useEffect(() => {
    const toExpand: string[] = [];
    const checkItem = (item: NavItem) => {
      if (item.children) {
        const isChildActive = item.children.some(
          (c) => location === c.path || location.startsWith(c.path + "/") || (c.children && c.children.some(gc => location === gc.path || location.startsWith(gc.path + "/")))
        );
        if (isChildActive && !expandedItems.includes(item.path)) {
          toExpand.push(item.path);
        }
        for (const child of item.children) {
          checkItem(child);
        }
      }
    };
    for (const item of filteredNavItems) {
      checkItem(item);
    }
    if (toExpand.length > 0) {
      setExpandedItems((prev) => [...prev, ...toExpand.filter(p => !prev.includes(p))]);
    }
  }, [location]);

    useEffect(() => {
      if (!user) return;
      const sessionId = sessionStorage.getItem("ghayth_session") || crypto.randomUUID();
      sessionStorage.setItem("ghayth_session", sessionId);
      apiFetch("/intelligence/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: location, sessionId }),
      }).catch(() => {});
    }, [location, user]);

    const toggleExpand = (path: string) => {
    setExpandedItems((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const isItemActive = (item: NavItem): boolean => {
    if (location === item.path) return true;
    if (item.children) {
      return item.children.some(
        (child) => location === child.path || location.startsWith(child.path + "/") || isItemActive(child)
      );
    }
    return location.startsWith(`${item.path}/`);
  };

  const buildBreadcrumbs = () => {
    const crumbs: { label: string; path: string }[] = [{ label: "الرئيسية", path: "/dashboard" }];
    if (location === "/" || location === "/dashboard") return null;

    const findCrumbs = (items: NavItem[], ancestors: { label: string; path: string }[]): boolean => {
      for (const item of items) {
        if (item.path === "/dashboard") continue;
        const trail = [...ancestors, { label: item.label, path: item.path }];
        if (item.path === location) {
          crumbs.push(...trail);
          return true;
        }
        if (item.children) {
          if (findCrumbs(item.children, trail)) return true;
        }
        if (!item.children && location.startsWith(item.path + "/")) {
          crumbs.push(...trail, { label: "تفاصيل", path: location });
          return true;
        }
      }
      return false;
    };

    findCrumbs(allNavItems, []);

    if (crumbs.length <= 1) return null;

    return (
      <div className="bg-gray-50 border-b border-gray-100 px-4 lg:px-8 py-2 flex-shrink-0">
        <nav aria-label="شريط المسار">
          <ol className="flex items-center gap-1.5 text-sm text-gray-500">
            {crumbs.map((crumb, i) => (
              <li key={crumb.path + i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronLeft className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />}
                {i === crumbs.length - 1 ? (
                  <span className="text-gray-800 font-medium">{crumb.label}</span>
                ) : (
                  <Link href={crumb.path} className="hover:text-blue-600 transition-colors">
                    {i === 0 ? (
                      <span className="flex items-center gap-1">
                        <Home className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{crumb.label}</span>
                      </span>
                    ) : crumb.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    );
  };

  const renderNavItem = (item: NavItem, isChild = false) => {
    const isActive = isItemActive(item);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.path);

    if (isSidebarCollapsed && isChild) return null;

    if (isSidebarCollapsed) {
      const targetPath = hasChildren && item.children!.length > 0 ? item.children![0].path : item.path;
      return (
        <Link key={item.path} href={targetPath}>
          <span
            className={cn(
              "flex items-center justify-center py-2.5 rounded-lg transition-colors cursor-pointer",
              isActive ? "bg-primary/10 text-primary" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            )}
            title={item.label}
          >
            <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-gray-400")} />
          </span>
        </Link>
      );
    }

    if (hasChildren) {
      return (
        <div key={item.path}>
          <button
            onClick={() => toggleExpand(item.path)}
            className={cn(
              "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-primary" : "text-gray-400")} />
              {item.label}
            </div>
            <div className="flex items-center gap-1.5">
              {!isExpanded && item.children && item.children.length > 0 && (
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {item.children.length}
                </span>
              )}
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </div>
          </button>
          {isExpanded && (
            <div className="ms-4 mt-0.5 space-y-0.5 border-s-2 border-gray-100 ps-2">
              {item.children!.map((child) => renderNavItem(child, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link key={item.path} href={item.path}>
        <span
          className={cn(
            "flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer",
            isChild ? "py-1.5" : "py-2",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
        >
          <item.icon className={cn(isChild ? "h-3.5 w-3.5" : "h-[18px] w-[18px]", isActive ? "text-primary" : "text-gray-400")} />
          {item.label}
        </span>
      </Link>
    );
  };

  const findInTree = (items: NavItem[], loc: string): { label: string; icon: any } | null => {
    for (const item of items) {
      if (item.path === loc) return { label: item.label, icon: item.icon };
      if (item.children) {
        const found = findInTree(item.children, loc);
        if (found) return found;
      }
      if (!item.children && loc.startsWith(item.path + "/")) {
        return { label: item.label, icon: item.icon };
      }
    }
    return null;
  };

  const getPageTitle = () => {
    for (const item of allNavItems) {
      const found = findInTree([item], location);
      if (found) return { label: found.label, Icon: found.icon };
    }
    return { label: "الرئيسية", Icon: LayoutDashboard };
  };

  const { label: pageTitle, Icon: PageIcon } = getPageTitle();
  const currentRoleColor = selectedRoleColor;

  interface QuickAction {
    label: string;
    icon: any;
    link: string;
    minRoleLevel?: number;
  }

  const pageQuickActions: Record<string, QuickAction[]> = {
    "/employees": [
      { label: "إضافة موظف", icon: Plus, link: "/employees/create" },
      { label: "تصدير", icon: Download, link: "/employees?export=1" },
    ],
    "/hr": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "تسجيل حضور", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "عرض الموظفين", icon: Users2, link: "/employees" },
    ],
    "/hr/leaves": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "اعتماد الطلبات", icon: CheckSquare, link: "/hr/leaves?tab=pending", minRoleLevel: 40 },
    ],
    "/hr/leaves/management": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "عرض الطلبات", icon: ClipboardList, link: "/hr/leaves" },
    ],
    "/hr/leaves/approval-chains": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "إدارة الإجازات", icon: ClipboardList, link: "/hr/leaves/management" },
    ],
    "/hr/attendance": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
    ],
    "/hr/attendance/reports": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تتبع ميداني", icon: MapPin, link: "/hr/attendance/field-tracking" },
    ],
    "/hr/attendance/field-tracking": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
    ],
    "/hr/attendance/qr-scanner": [
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
      { label: "تتبع ميداني", icon: MapPin, link: "/hr/attendance/field-tracking" },
    ],
    "/hr/payroll": [
      { label: "مسير رواتب جديد", icon: Plus, link: "/hr/payroll/create" },
      { label: "مكونات الرواتب", icon: Settings, link: "/hr/payroll/salary-components" },
    ],
    "/hr/payroll/salary-components": [
      { label: "مسير رواتب جديد", icon: Plus, link: "/hr/payroll/create" },
      { label: "مسيرات الرواتب", icon: DollarSign, link: "/hr/payroll" },
    ],
    "/hr/performance": [
      { label: "تقييم جديد", icon: Plus, link: "/hr/performance/create" },
      { label: "تقييم متقدم", icon: BarChart3, link: "/hr/performance/advanced" },
    ],
    "/hr/performance/advanced": [
      { label: "تقييم جديد", icon: Plus, link: "/hr/performance/create" },
      { label: "التقييمات", icon: Star, link: "/hr/performance" },
    ],
    "/hr/training": [
      { label: "برنامج تدريبي جديد", icon: Plus, link: "/hr/training/create" },
    ],
    "/hr/recruitment": [
      { label: "وظيفة جديدة", icon: Plus, link: "/hr/recruitment/create" },
      { label: "المتقدمين", icon: Users2, link: "/hr/recruitment/applications" },
    ],
    "/hr/recruitment/applications": [
      { label: "وظيفة جديدة", icon: Plus, link: "/hr/recruitment/create" },
      { label: "الوظائف", icon: Briefcase, link: "/hr/recruitment" },
    ],
    "/hr/loans": [
      { label: "طلب سلفة جديدة", icon: Plus, link: "/hr/loans/create" },
      { label: "الرواتب", icon: DollarSign, link: "/hr/payroll" },
    ],
    "/hr/overtime": [
      { label: "طلب وقت إضافي", icon: Plus, link: "/hr/overtime/create" },
      { label: "الحضور", icon: Clock, link: "/hr/attendance" },
    ],
    "/hr/exit": [
      { label: "طلب نهاية خدمة", icon: Plus, link: "/hr/exit/create" },
      { label: "مكافأة نهاية الخدمة", icon: DollarSign, link: "/hr/gratuity" },
    ],
    "/hr/violations": [
      { label: "مخالفة جديدة", icon: Plus, link: "/hr/violations/create" },
      { label: "الرصد التلقائي", icon: Radar, link: "/hr/violations/auto-detection" },
      { label: "إدارة المخالفات", icon: ClipboardList, link: "/hr/violations/management" },
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/discipline/memos" },
      { label: "لائحة الانضباط", icon: BookOpen, link: "/hr/discipline/regulation" },
    ],
    "/hr/violations/auto-detection": [
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
      { label: "مخالفة جديدة", icon: Plus, link: "/hr/violations/create" },
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/discipline/memos" },
    ],
    "/hr/violations/management": [
      { label: "مخالفة جديدة", icon: Plus, link: "/hr/violations/create" },
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/discipline/memos" },
    ],
    "/hr/discipline/memos": [
      { label: "محضر جديد", icon: Plus, link: "/hr/discipline/memos" },
      { label: "لائحة الانضباط", icon: BookOpen, link: "/hr/discipline/regulation" },
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
    ],
    "/hr/discipline/regulation": [
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/discipline/memos" },
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
    ],
    "/hr/shifts": [
      { label: "وردية جديدة", icon: Plus, link: "/hr/shifts/create" },
      { label: "إدارة الورديات", icon: Clock, link: "/hr/shifts/management" },
    ],
    "/hr/shifts/management": [
      { label: "وردية جديدة", icon: Plus, link: "/hr/shifts/create" },
      { label: "الورديات", icon: Clock, link: "/hr/shifts" },
    ],
    "/finance/invoices": [
      { label: "فاتورة جديدة", icon: Plus, link: "/finance/invoices/create" },
      { label: "طباعة", icon: Printer, link: "/finance/invoices?action=print", minRoleLevel: 40 },
    ],
    "/finance/expenses": [
      { label: "مصروف جديد", icon: Plus, link: "/finance/expenses?action=new" },
      { label: "اعتماد المصروفات", icon: CheckSquare, link: "/finance/expenses?tab=pending", minRoleLevel: 40 },
    ],
    "/finance/vouchers": [
      { label: "سند جديد", icon: Plus, link: "/finance/vouchers/create" },
    ],
    "/finance/purchase-orders": [
      { label: "طلب شراء جديد", icon: Plus, link: "/finance/purchase-orders?action=new" },
      { label: "اعتماد الطلبات", icon: CheckSquare, link: "/finance/purchase-orders?tab=pending", minRoleLevel: 40 },
    ],
    "/tasks": [
      { label: "مهمة جديدة", icon: Plus, link: "/tasks?action=new" },
    ],
    "/projects": [
      { label: "مشروع جديد", icon: Plus, link: "/projects/create" },
    ],
    "/clients": [
      { label: "عميل جديد", icon: Plus, link: "/clients/create" },
    ],
    "/fleet": [
      { label: "مركبة جديدة", icon: Plus, link: "/fleet?action=new" },
    ],
    "/support": [
      { label: "تذكرة جديدة", icon: Plus, link: "/support/create" },
    ],
    "/requests": [
      { label: "تقديم طلب", icon: Send, link: "/requests?action=new" },
    ],
    "/warehouse": [
      { label: "منتج جديد", icon: Plus, link: "/warehouse?action=new" },
    ],
    "/properties": [
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
    ],
    "/properties/dashboard": [
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
      { label: "عقد جديد", icon: Plus, link: "/properties/contracts/create" },
    ],
    "/properties/buildings": [
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
    ],
    "/properties/tenants": [
      { label: "مستأجر جديد", icon: Plus, link: "/properties/tenants/create" },
    ],
    "/properties/contracts": [
      { label: "عقد إيجار جديد", icon: Plus, link: "/properties/contracts/create" },
    ],
    "/properties/payments": [
      { label: "تسجيل دفعة", icon: Plus, link: "/properties/payments?action=new" },
    ],
    "/properties/maintenance": [
      { label: "طلب صيانة جديد", icon: Plus, link: "/properties/maintenance/create" },
    ],
  };

  const resolveQuickActions = (path: string): QuickAction[] => {
    if (pageQuickActions[path]) return pageQuickActions[path];
    const segments = path.split("/").filter(Boolean);
    while (segments.length > 0) {
      segments.pop();
      const parentPath = "/" + segments.join("/");
      if (pageQuickActions[parentPath]) return pageQuickActions[parentPath];
    }
    return [];
  };

  const currentQuickActions = resolveQuickActions(location).filter(
    (a) => !a.minRoleLevel || effectiveRoleLevel >= a.minRoleLevel
  );

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden" dir="rtl">
      <aside
        className={cn(
          "bg-white border-e border-gray-200 fixed inset-y-0 start-0 z-50 flex-shrink-0 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "w-16" : "w-64",
          isSidebarOpen ? "translate-x-0" : "translate-x-full",
          "lg:!translate-x-0"
        )}
      >
        <div className="h-full flex flex-col">
          <div className={cn("h-14 flex items-center border-b border-gray-100", isSidebarCollapsed ? "justify-center px-2" : "justify-between px-5")}>
            {isSidebarCollapsed ? (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg text-primary hover:bg-gray-50 transition-colors"
                title="توسيع القائمة"
              >
                <CloudRain className="h-5 w-5" />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 font-bold text-lg text-primary">
                  <CloudRain className="h-5 w-5" />
                  <span>{globalSettings.companyName || "منصة غيث"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden lg:flex h-8 w-8 text-gray-400 hover:text-gray-600"
                    onClick={() => setIsSidebarCollapsed(true)}
                    title="طي القائمة"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden h-8 w-8"
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>

          <nav className={cn("flex-1 overflow-y-auto py-2", isSidebarCollapsed ? "px-1" : "px-3")}>
            {filteredSections.map((section, sectionIdx) => (
              <div key={section.title}>
                {sectionIdx > 0 && (
                  <div className={cn("my-2 border-t border-gray-100", isSidebarCollapsed ? "mx-1" : "mx-2")} />
                )}
                {section.title !== "الرئيسية" && !isSidebarCollapsed && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => renderNavItem(item))}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn("border-t border-gray-100", isSidebarCollapsed ? "p-2" : "p-3")}>
            {isSidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: currentRoleColor }}
                  title={user?.name || "مستخدم"}
                >
                  {(user?.name || "مستخدم").substring(0, 2)}
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="تسجيل الخروج" className="h-7 w-7">
                  <LogOut className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: currentRoleColor }}
                >
                  {(user?.name || "مستخدم").substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name || "مستخدم"}</p>
                  <p className="text-xs truncate" style={{ color: currentRoleColor }}>
                    {jobTitle || selectedRoleLabel}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="تسجيل الخروج" className="h-8 w-8">
                  <LogOut className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={cn("flex-1 flex flex-col min-w-0 h-screen overflow-hidden transition-all duration-300", isSidebarCollapsed ? "lg:ms-16" : "lg:ms-64")}>
        <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 z-40">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {location !== "/dashboard" && location !== "/" && (
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600" title="الرجوع للرئيسية">
                  <Home className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <PageIcon className="h-[18px] w-[18px] text-blue-600" />
              <span className="hidden sm:inline">{pageTitle}</span>
            </h1>
            {currentQuickActions.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 ms-3">
                {currentQuickActions.map((action) => (
                  <Link key={action.link} href={action.link}>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 bg-white">
                      <action.icon className="h-3.5 w-3.5" />
                      {action.label}
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:block">
              <button
                onClick={() => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); }}
                className="flex items-center gap-2 h-9 px-3 text-sm text-gray-400 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white hover:border-blue-300 hover:text-gray-600 transition-all w-72"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-start">بحث في الصفحات والإجراءات...</span>
                <kbd className="hidden lg:flex items-center gap-0.5 text-[10px] text-gray-300 bg-white border border-gray-200 rounded px-1 py-0.5">Ctrl+K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1 py-0.5 bg-gray-50/50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="gap-1.5 px-2 h-8 hover:bg-white"
                    style={{ color: currentRoleColor }}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden md:inline-block text-xs font-medium">
                      {jobTitle || selectedRoleLabel}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-gray-500">تغيير الصفة الوظيفية</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userRoles.map((role) => {
                    const color = roleKeyColors[role.roleKey] || "#95A5A6";
                    const isActive = selectedRole?.roleKey === role.roleKey;
                    return (
                      <DropdownMenuItem
                        key={role.roleKey}
                        onClick={() => setSelectedRoleKey(role.roleKey)}
                        className={isActive ? "bg-purple-50" : ""}
                      >
                        <Shield className="h-4 w-4 me-2" style={{ color }} />
                        <span style={{ color: isActive ? color : undefined }}>
                          {role.label}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  {userRoles.length === 0 && (
                    <DropdownMenuItem disabled>
                      <span className="text-gray-400 text-xs">لا توجد أدوار مسندة</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {companies.length > 1 && (
                <>
                  <div className="w-px h-5 bg-gray-200" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-1.5 px-2 h-8 text-emerald-700 hover:bg-white">
                        <Building className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="hidden md:inline-block text-xs font-medium">
                          {selectedCompanyIds.length === 0
                            ? "جميع الشركات"
                            : selectedCompanyIds.length === 1
                              ? (companies.find(c => c.id === selectedCompanyIds[0])?.name || "شركة")
                              : `${selectedCompanyIds.length} شركات`}
                        </span>
                        {selectedCompanyIds.length > 1 && (
                          <span className="bg-emerald-600 text-white text-[10px] px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                            {selectedCompanyIds.length}
                          </span>
                        )}
                        <ChevronDown className="h-3 w-3 text-emerald-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs text-gray-500">اختيار الشركات</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setSelectedCompanyIds([])}
                        className={selectedCompanyIds.length === 0 ? "bg-emerald-50 text-emerald-700 font-medium" : ""}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedCompanyIds.length === 0 ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}>
                            {selectedCompanyIds.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <Building className="h-4 w-4 text-emerald-500" />
                          <span>جميع الشركات</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {companies.map((company) => {
                        const isSelected = selectedCompanyIds.includes(company.id);
                        return (
                          <DropdownMenuItem
                            key={company.id}
                            onClick={(e) => {
                              e.preventDefault();
                              if (isSelected) {
                                const updated = selectedCompanyIds.filter(id => id !== company.id);
                                setSelectedCompanyIds(updated);
                              } else {
                                const updated = [...selectedCompanyIds, company.id];
                                setSelectedCompanyIds(updated);
                                if (updated.length === 1) {
                                  switchToCompany(company.id);
                                }
                              }
                            }}
                            className={isSelected ? "bg-emerald-50" : ""}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}>
                                {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                              </div>
                              <Building className={`h-4 w-4 ${isSelected ? "text-emerald-600" : "text-gray-400"}`} />
                              <span>{company.name}</span>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              <div className="w-px h-5 bg-gray-200" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-1.5 px-2 h-8 text-blue-700 hover:bg-white">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    <span className="hidden md:inline-block text-xs font-medium">
                      {selectedBranchIds.length === 0
                        ? "جميع الفروع"
                        : selectedBranchIds.length === 1
                          ? (filteredBranches.find(b => b.id === selectedBranchIds[0])?.name || "فرع")
                          : `${selectedBranchIds.length} فروع`}
                    </span>
                    {selectedBranchIds.length > 1 && (
                      <span className="bg-blue-600 text-white text-[10px] px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                        {selectedBranchIds.length}
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3 text-blue-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-gray-500">اختيار الفروع</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSelectedBranchIds([])}
                    className={selectedBranchIds.length === 0 ? "bg-blue-50 text-blue-700 font-medium" : ""}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedBranchIds.length === 0 ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                        {selectedBranchIds.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <Building2 className="h-4 w-4 text-blue-500" />
                      <span>جميع الفروع</span>
                      <span className="ms-auto text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">الكل</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {filteredBranches.map((branch) => {
                    const isSelected = selectedBranchIds.includes(branch.id);
                    return (
                      <DropdownMenuItem
                        key={branch.id}
                        onClick={(e) => {
                          e.preventDefault();
                          if (isSelected) {
                            setSelectedBranchIds(selectedBranchIds.filter(id => id !== branch.id));
                          } else {
                            setSelectedBranchIds([...selectedBranchIds, branch.id]);
                          }
                        }}
                        className={isSelected ? "bg-blue-50" : ""}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                            {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <Building2 className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                          <span>{branch.name}</span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <NotificationDropdown />

            <div className="sm:hidden">
              <button
                onClick={() => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); }}
                className="flex items-center justify-center h-8 w-8 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white text-gray-400"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {buildBreadcrumbs()}
        <PolicyBanner currentPath={location} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} initialFilter={commandPaletteFilter} />
        </Suspense>
      )}
    </div>
  );
}
