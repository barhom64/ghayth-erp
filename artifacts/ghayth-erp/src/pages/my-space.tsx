import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Briefcase, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertsSection } from "./my-space/alerts-section";
import { SecondaryAlertsSection } from "./my-space/secondary-alerts-section";
import { RoleEntitiesGrid } from "./my-space/role-entities-grid";
import { SummaryCards } from "./my-space/summary-cards";
import { EntityCardsSection } from "./my-space/entity-cards-section";
import { LeavesAndRequestsSection } from "./my-space/leaves-and-requests-section";
import { TasksAndNotificationsSection } from "./my-space/tasks-and-notifications-section";
import { CustodiesAndDocumentsSection } from "./my-space/custodies-and-documents-section";
import { RecentActionsAndPerformanceSection } from "./my-space/recent-actions-and-performance-section";
import { ActiveLoansCard } from "./my-space/active-loans-card";
import { ViolationsCard } from "./my-space/violations-card";
import { PendingApprovalsCard } from "./my-space/pending-approvals-card";
import { MonthlySummaryCard } from "./my-space/monthly-summary-card";
import { SmartSuggestionsCard } from "./my-space/smart-suggestions-card";
import { AccountInfoCard } from "./my-space/account-info-card";
import { ChangePasswordSection } from "./my-space/change-password-section";

export default function MySpace() {
  const { user } = useAuth();
  const { scopeQueryString, selectedRoleLabel, roleLevel } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["my-space", scopeQueryString],
    `/my-space${scopeSuffix}`
  );

  const { data: suggestionsResp } = useApiQuery<any>(
    ["intelligence-suggestions-myspace"],
    "/intelligence/suggestions",
    roleLevel >= 40
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const attendance = data?.attendance;
  const leaveBalances = data?.leaveBalances || [];
  const openRequests = data?.openRequests || [];
  const pendingApprovals = data?.pendingApprovals || [];
  const documents = data?.documents || [];
  const lastPayslip = data?.lastPayslip;
  const todayTasks = data?.todayTasks || [];
  const notifications = data?.notifications || [];
  const custodies = data?.custodies || [];
  const violations = data?.violations || [];
  const activeLoans = data?.activeLoans || [];
  const currentShift = data?.currentShift;
  const monthlyStats = data?.monthlyStats;
  const recentActions = data?.recentActions || [];
  const performanceReviews = data?.performanceReviews || [];
  const overdueItems = data?.overdueItems || [];
  const expiringSoon = data?.expiringSoon || [];
  const roleEntities = data?.roleEntities;
  const role = data?.role;

  return (
    <PageShell
      title="مساحتي"
      subtitle={`مرحباً ${user?.name || "موظف"} — ${selectedRoleLabel}`}
      actions={
        role !== "employee" && (
          <Link href="/action-center">
            <Button variant="outline" className="gap-2">
              <Briefcase className="w-4 h-4" />
              مركز القرارات
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          </Link>
        )
      }
    >

      <AlertsSection overdueItems={overdueItems} expiringSoon={expiringSoon} />

      <RoleEntitiesGrid roleEntities={roleEntities} role={role} />

      <SummaryCards
        attendance={attendance}
        monthlyStats={monthlyStats}
        currentShift={currentShift}
        lastPayslip={lastPayslip}
      />

      <SecondaryAlertsSection overdueItems={overdueItems} expiringSoon={expiringSoon} />

      <EntityCardsSection roleEntities={roleEntities} role={role} />

      <LeavesAndRequestsSection leaveBalances={leaveBalances} openRequests={openRequests} />

      <TasksAndNotificationsSection todayTasks={todayTasks} notifications={notifications} />

      <CustodiesAndDocumentsSection custodies={custodies} documents={documents} />

      <RecentActionsAndPerformanceSection
        recentActions={recentActions}
        performanceReviews={performanceReviews}
      />

      <ActiveLoansCard activeLoans={activeLoans} />

      <ViolationsCard violations={violations} />

      <PendingApprovalsCard pendingApprovals={pendingApprovals} role={role} />

      <MonthlySummaryCard monthlyStats={monthlyStats} />

      {roleLevel >= 40 && <SmartSuggestionsCard suggestions={suggestionsResp?.data || []} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AccountInfoCard
          email={user?.email}
          name={user?.name}
          selectedRoleLabel={selectedRoleLabel}
        />
        <ChangePasswordSection />
      </div>
    </PageShell>
  );
}
