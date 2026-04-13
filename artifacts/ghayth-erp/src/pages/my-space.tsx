import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Briefcase, ArrowUpRight } from "lucide-react";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">حدث خطأ في تحميل البيانات</h2>
        <p className="text-sm text-gray-500 mb-4">{error?.message || "خطأ غير متوقع"}</p>
        <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

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
  const currentShift = data?.currentShift;
  const monthlyStats = data?.monthlyStats;
  const recentActions = data?.recentActions || [];
  const performanceReviews = data?.performanceReviews || [];
  const overdueItems = data?.overdueItems || [];
  const expiringSoon = data?.expiringSoon || [];
  const roleEntities = data?.roleEntities;
  const role = data?.role;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مساحتي</h1>
          <p className="text-gray-500 mt-1">
            مرحباً {user?.name || "موظف"} — {selectedRoleLabel}
          </p>
        </div>
        {role !== "employee" && (
          <Link href="/action-center">
            <Button variant="outline" className="gap-2">
              <Briefcase className="w-4 h-4" />
              مركز القرارات
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          </Link>
        )}
      </div>

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
    </div>
  );
}
