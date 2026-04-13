import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CEODashboardTab } from "./bi/ceo-dashboard-tab";
import { OverviewTab } from "./bi/overview-tab";
import { BranchPerformanceTab } from "./bi/branch-performance-tab";
import { VendorPerformanceTab } from "./bi/vendor-performance-tab";
import { FleetTCOTab } from "./bi/fleet-tco-tab";
import { LeaveBalanceTab } from "./bi/leave-balance-tab";
import { PropertyOccupancyTab } from "./bi/property-occupancy-tab";
import { TrainingROITab } from "./bi/training-roi-tab";
import { AIInsightsTab } from "./bi/ai-insights-tab";
import { AlertFatigueTab } from "./bi/alert-fatigue-tab";

export default function BIPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="ceo" dir="rtl">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10 gap-1 h-auto flex-wrap">
          <TabsTrigger value="ceo" className="text-xs">لوحة الرئيس التنفيذي</TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">نظرة عامة</TabsTrigger>
          <TabsTrigger value="branches" className="text-xs">الفروع</TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs">الموردون</TabsTrigger>
          <TabsTrigger value="fleet-tco" className="text-xs">تكلفة الأسطول</TabsTrigger>
          <TabsTrigger value="leave-balance" className="text-xs">رصيد الإجازات</TabsTrigger>
          <TabsTrigger value="property" className="text-xs">الإشغال العقاري</TabsTrigger>
          <TabsTrigger value="training" className="text-xs">عائد التدريب</TabsTrigger>
          <TabsTrigger value="ai-insights" className="text-xs">رؤى AI</TabsTrigger>
          <TabsTrigger value="alert-fatigue" className="text-xs">إدارة التنبيهات</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="ceo"><CEODashboardTab /></TabsContent>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="branches"><BranchPerformanceTab /></TabsContent>
          <TabsContent value="vendors"><VendorPerformanceTab /></TabsContent>
          <TabsContent value="fleet-tco"><FleetTCOTab /></TabsContent>
          <TabsContent value="leave-balance"><LeaveBalanceTab /></TabsContent>
          <TabsContent value="property"><PropertyOccupancyTab /></TabsContent>
          <TabsContent value="training"><TrainingROITab /></TabsContent>
          <TabsContent value="ai-insights"><AIInsightsTab /></TabsContent>
          <TabsContent value="alert-fatigue"><AlertFatigueTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
