/**
 * GAP_MATRIX P2 — Admin hub page: tab-based display of admin sub-module cards.
 * Cards are intentionally display-only here; each sub-page has its own route.
 * Navigation is via the sidebar or direct URLs, not onClick handlers on cards.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, KeyRound, ScrollText, UserCog, Lock, FileSearch, ShieldAlert,
  Shield, Layers, GitBranch, AlertTriangle, Scale, Cog, Zap, Radar, Bot, Radio, Phone, Target, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@workspace/ui-core";
import { UsersTab } from "./admin/users-tab";
import { LogsTab } from "./admin/logs-tab";
import { SecurityLogTab } from "./admin/security-log-tab";
import { AuditExplorerTab } from "./admin/audit-explorer-tab";
import { RbacV2Tab } from "./admin/rbac-v2-tab";
import { UserRoleAssignmentTab } from "./admin/rbac-v2-users-tab";
import { SodRulesTab } from "./admin/rbac-v2-sod-tab";
import { JitRequestsTab } from "./admin/rbac-v2-jit-tab";
import { useLocation } from "wouter";
import { useState } from "react";

export default function AdminPage() {
  const [, navigate] = useLocation();
  // GAP_MATRIX conflict #6 resolution — the 7 "intent" cards at the
  // top of this hub previously had no onClick. SYSTEM_PAGE_INVENTORY
  // flagged the page as "needs backend wiring"; DEAD_DUPLICATE_PAGE_AUDIT
  // said "intentional hub". Both were partly right — the cards needed
  // wiring, but to the tabs already on this page, not to new APIs.
  // Now each card flips the Tabs state below to the matching section.
  const [activeTab, setActiveTab] = useState("rbac-v2");

  const overviewCards: { label: string; icon: any; color: string; tab: string }[] = [
    { label: "المستخدمين",   icon: Users,       color: "text-status-info-foreground bg-status-info-surface",      tab: "users" },
    { label: "إسناد الأدوار", icon: UserCog,     color: "text-orange-600 bg-orange-50",                              tab: "rbac-users" },
    { label: "سجلات النظام", icon: ScrollText,  color: "text-muted-foreground bg-surface-subtle",                   tab: "logs" },
    { label: "سجل الأمن",    icon: ShieldAlert, color: "text-status-error-foreground bg-status-error-surface",      tab: "security" },
    { label: "سجل المراجعة", icon: FileSearch,  color: "text-status-warning-foreground bg-status-warning-surface", tab: "audit" },
  ];

  return (
    <PageShell title="لوحة الإدارة" breadcrumbs={[{ label: "الإدارة" }]}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
        {overviewCards.map((c) => (
          <Card
            key={c.label}
            className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setActiveTab(c.tab)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveTab(c.tab); } }}
            title={`فتح تبويب ${c.label}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <p className="font-semibold text-sm">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">محركات النظام والحوكمة</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
          {[
            { label: "حاكم النظام", icon: Shield, color: "text-emerald-600 bg-emerald-50", path: "/admin/system-governor" },
            { label: "محرك السياسات", icon: Cog, color: "text-status-info-foreground bg-status-info-surface", path: "/admin/policy-engine" },
            { label: "سجل النطاقات", icon: Layers, color: "text-purple-600 bg-purple-50", path: "/admin/domain-registry" },
            { label: "كتالوج الأحداث", icon: Zap, color: "text-status-warning-foreground bg-status-warning-surface", path: "/admin/event-monitor" },
            { label: "فشل القيود المالية", icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface", path: "/admin/posting-failures" },
            { label: "دورة الحياة", icon: GitBranch, color: "text-cyan-600 bg-cyan-50", path: "/admin/lifecycle-monitor" },
            { label: "مصفوفة الصلاحيات", icon: Lock, color: "text-indigo-600 bg-indigo-50", path: "/admin/rbac-matrix" },
            { label: "مطابقة الأستاذ", icon: Scale, color: "text-teal-600 bg-teal-50", path: "/admin/gl-reconciliation" },
            { label: "مرصد المراقبة الموحّد", icon: Radar, color: "text-rose-600 bg-rose-50", path: "/admin/observability" },
            { label: "حوكمة الذكاء الاصطناعي", icon: Bot, color: "text-fuchsia-600 bg-fuchsia-50", path: "/admin/ai-governance" },
            { label: "مركز التحكّم بالاتصالات", icon: Radio, color: "text-sky-600 bg-sky-50", path: "/admin/communication-control" },
            { label: "مركز التحكّم بالـ PBX", icon: Phone, color: "text-orange-600 bg-orange-50", path: "/admin/pbx-control" },
            { label: "خارطة #1139 الحيّة", icon: Target, color: "text-amber-600 bg-amber-50", path: "/admin/master-plan" },
            { label: "توجيه الإشعارات", icon: Bell, color: "text-violet-600 bg-violet-50", path: "/admin/notification-routing" },
            { label: "إعدادات المزوّدات", icon: Cog, color: "text-zinc-600 bg-zinc-50", path: "/admin/vendor-settings" },
          ].map((item) => (
            <Card
              key={item.path}
              className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", item.color.split(" ")[1])}>
                  <item.icon className={cn("w-4 h-4", item.color.split(" ")[0])} />
                </div>
                <p className="font-medium text-xs">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 h-auto">
          <TabsTrigger value="rbac-v2" className="text-xs sm:text-sm">الصلاحيات الطبقية</TabsTrigger>
          <TabsTrigger value="rbac-users" className="text-xs sm:text-sm">إسناد v2</TabsTrigger>
          <TabsTrigger value="rbac-sod" className="text-xs sm:text-sm">قواعد SoD</TabsTrigger>
          <TabsTrigger value="rbac-jit" className="text-xs sm:text-sm">طلبات مؤقتة</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm">المستخدمين</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs sm:text-sm">السجلات</TabsTrigger>
          <TabsTrigger value="security" className="text-xs sm:text-sm">سجل الأمن</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs sm:text-sm">سجل المراجعة</TabsTrigger>
        </TabsList>
        <TabsContent value="rbac-v2"><RbacV2Tab /></TabsContent>
        <TabsContent value="rbac-users"><UserRoleAssignmentTab /></TabsContent>
        <TabsContent value="rbac-sod"><SodRulesTab /></TabsContent>
        <TabsContent value="rbac-jit"><JitRequestsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
        <TabsContent value="security"><SecurityLogTab /></TabsContent>
        <TabsContent value="audit"><AuditExplorerTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
