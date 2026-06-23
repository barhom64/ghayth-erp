import { useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, FileCheck, AlertTriangle, ClipboardCheck, CheckCircle2, Activity } from "lucide-react";
import { StatsCards } from "./governance/stats-cards";
import { PoliciesTab } from "./governance/policies-tab";
import { RisksTab } from "./governance/risks-tab";
import { AuditsTab } from "./governance/audits-tab";
import { ComplianceTab } from "./governance/compliance-tab";
import { ComplianceDashboardTab } from "./governance/compliance-dashboard-tab";
import { ComplianceActionsTab } from "./governance/compliance-actions-tab";
import { CAPATab } from "./governance/capa-tab";

// Routes /governance/policies, /risks, /audits, /compliance all share this
// component. Without seeding from URL, those links would always land on the
// "policies" tab.
const GOV_PATH_TAB: Record<string, string> = {
  "/governance/policies": "policies",
  "/governance/risks": "risks",
  "/governance/audits": "audits",
  "/governance/compliance": "compliance",
};

export default function GovernancePage() {
  const [location] = useLocation();
  const initialTab = GOV_PATH_TAB[location] ?? "policies";
  const { data: stats, isLoading, isError } = useApiQuery<any>(["gov-stats"], "/governance/stats");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الحوكمة والامتثال"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "الحوكمة والامتثال" },
      ]}
      subtitle="إدارة السياسات والمخاطر والتدقيق والامتثال"
    >
      <StatsCards stats={stats} />
      <Tabs defaultValue={initialTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 h-auto md:h-9">
          <TabsTrigger value="policies"><FileCheck className="h-4 w-4 me-1" />السياسات</TabsTrigger>
          <TabsTrigger value="risks"><AlertTriangle className="h-4 w-4 me-1" />المخاطر</TabsTrigger>
          <TabsTrigger value="audits"><ClipboardCheck className="h-4 w-4 me-1" />التدقيق</TabsTrigger>
          <TabsTrigger value="compliance"><Shield className="h-4 w-4 me-1" />الامتثال</TabsTrigger>
          <TabsTrigger value="actions"><Activity className="h-4 w-4 me-1" />الإجراءات</TabsTrigger>
          <TabsTrigger value="capa"><CheckCircle2 className="h-4 w-4 me-1" />الإجراءات التصحيحية والوقائية</TabsTrigger>
        </TabsList>
        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="risks"><RisksTab /></TabsContent>
        <TabsContent value="audits"><AuditsTab /></TabsContent>
        <TabsContent value="compliance">
          <div className="space-y-6">
            <ComplianceDashboardTab />
            <ComplianceTab />
          </div>
        </TabsContent>
        <TabsContent value="actions"><ComplianceActionsTab /></TabsContent>
        <TabsContent value="capa"><CAPATab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
