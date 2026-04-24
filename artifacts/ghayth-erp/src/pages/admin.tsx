import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, KeyRound, ScrollText, UserCog, Lock, FileSearch, ShieldAlert,
  Shield, Layers, Activity, GitBranch, AlertTriangle, Scale, Cog, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { UsersTab } from "./admin/users-tab";
import { RoleAssignmentTab } from "./admin/role-assignment-tab";
import { RolesTab } from "./admin/roles-tab";
import { LogsTab } from "./admin/logs-tab";
import { PermissionsTab } from "./admin/permissions-tab";
import { SecurityLogTab } from "./admin/security-log-tab";
import { AuditExplorerTab } from "./admin/audit-explorer-tab";
import { useLocation } from "wouter";

export default function AdminPage() {
  const [, navigate] = useLocation();

  return (
    <PageShell title="لوحة الإدارة" breadcrumbs={[{ label: "الإدارة" }]}>
      <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
        {[
          { label: "المستخدمين", icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "إسناد الأدوار", icon: UserCog, color: "text-orange-600 bg-orange-50" },
          { label: "الأدوار المتاحة", icon: KeyRound, color: "text-purple-600 bg-purple-50" },
          { label: "سجلات النظام", icon: ScrollText, color: "text-gray-600 bg-gray-50" },
          { label: "الصلاحيات", icon: Lock, color: "text-emerald-600 bg-emerald-50" },
          { label: "سجل الأمن", icon: ShieldAlert, color: "text-red-600 bg-red-50" },
          { label: "سجل المراجعة", icon: FileSearch, color: "text-amber-600 bg-amber-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
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
        <h3 className="text-sm font-semibold text-gray-600 mb-3">محركات النظام والحوكمة</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "حاكم النظام", icon: Shield, color: "text-emerald-600 bg-emerald-50", path: "/admin/system-governor" },
            { label: "محرك السياسات", icon: Cog, color: "text-blue-600 bg-blue-50", path: "/admin/policy-engine" },
            { label: "سجل النطاقات", icon: Layers, color: "text-purple-600 bg-purple-50", path: "/admin/domain-registry" },
            { label: "كتالوج الأحداث", icon: Zap, color: "text-amber-600 bg-amber-50", path: "/admin/event-monitor" },
            { label: "فشل القيود المالية", icon: AlertTriangle, color: "text-red-600 bg-red-50", path: "/admin/posting-failures" },
            { label: "دورة الحياة", icon: GitBranch, color: "text-cyan-600 bg-cyan-50", path: "/admin/lifecycle-monitor" },
            { label: "مصفوفة الصلاحيات", icon: Lock, color: "text-indigo-600 bg-indigo-50", path: "/admin/rbac-matrix" },
            { label: "مطابقة الأستاذ", icon: Scale, color: "text-teal-600 bg-teal-50", path: "/admin/gl-reconciliation" },
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

      <Tabs defaultValue="users" dir="rtl">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="users">المستخدمين</TabsTrigger>
          <TabsTrigger value="assign">إسناد الأدوار</TabsTrigger>
          <TabsTrigger value="roles">الأدوار</TabsTrigger>
          <TabsTrigger value="logs">السجلات</TabsTrigger>
          <TabsTrigger value="permissions">الصلاحيات</TabsTrigger>
          <TabsTrigger value="security">سجل الأمن</TabsTrigger>
          <TabsTrigger value="audit">سجل المراجعة</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="assign"><RoleAssignmentTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="security"><SecurityLogTab /></TabsContent>
        <TabsContent value="audit"><AuditExplorerTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
