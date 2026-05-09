import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
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

export default function GovernancePage() {
  const { data: stats, isLoading, isError } = useApiQuery<any>(["gov-stats"], "/governance/stats");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الحوكمة والامتثال"
      subtitle="إدارة السياسات والمخاطر والتدقيق والامتثال"
    >
      <StatsCards stats={stats} />
      <Tabs defaultValue="policies" dir="rtl">
        <TabsList className="grid w-full grid-cols-6">
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
