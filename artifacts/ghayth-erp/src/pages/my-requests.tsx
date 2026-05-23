import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageStatusBadge } from "@workspace/ui-core";
import {
  Clock, Calendar, DollarSign, FileSignature,
  CheckCircle2, XCircle, AlertCircle, ChevronLeft,
  RefreshCw, ClipboardList, Wallet, Timer, LogOut,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const typeLabels: Record<string, { label: string; icon: any }> = {
  leave: { label: "إجازة", icon: Calendar },
  salary_advance: { label: "سلفة راتب", icon: DollarSign },
  official_letter: { label: "خطاب رسمي", icon: FileSignature },
  loan: { label: "سلفة موظف", icon: Wallet },
  overtime: { label: "وقت إضافي", icon: Timer },
  exit: { label: "نهاية خدمة", icon: LogOut },
};

const detailPaths: Record<string, string> = {
  leave: "/hr/leaves",
  salary_advance: "/finance/salary-advances",
  official_letter: "/hr/official-letters",
  loan: "/hr/loans",
  overtime: "/hr/overtime",
  exit: "/hr/exit",
  purchase_request: "/finance/purchase-orders",
  expense: "/finance/expenses",
  financial_request: "/finance/financial-requests",
};

function getDetailUrl(req: any): string | null {
  const base = detailPaths[req.requestType];
  const id = req.refId || req.entityId;
  if (base && id) return `${base}/${id}`;
  return null;
}

function StatusBadge({ status }: { status: string }) {
  return <PageStatusBadge status={status} />;
}

export default function MyRequests() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"workflow" | "leaves">("workflow");
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["my-requests"], "/my-space/requests");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const workflowRequests: any[] = data?.data ?? [];
  const leaveRequests: any[] = data?.leaveRequests ?? [];

  return (
    <PageShell title="طلباتي" subtitle="تتبع حالة طلباتك المقدمة">
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("workflow")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "workflow"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-status-neutral-foreground"
          )}
        >
          طلبات الموافقة ({workflowRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("leaves")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "leaves"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-status-neutral-foreground"
          )}
        >
          طلبات الإجازة ({leaveRequests.length})
        </button>
      </div>

      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw size={14} />
          تحديث
        </Button>
      </div>

      {activeTab === "workflow" ? (
        workflowRequests.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">لا توجد طلبات بعد</p>
              <p className="text-sm mt-1">طلباتك ستظهر هنا بمجرد تقديمها</p>
              <div className="flex gap-2 justify-center mt-4">
                <Link href="/hr/leaves">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Calendar size={14} />
                    طلب إجازة
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {workflowRequests.map((req: any) => {
              const typeInfo = typeLabels[req.requestType] ?? { label: req.requestType, icon: ClipboardList };
              const TypeIcon = typeInfo.icon;
              const url = getDetailUrl(req);
              const card = (
                <Card key={req.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <TypeIcon size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{req.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {typeInfo.label} • {formatDateAr(req.createdAt)}
                          </p>
                          {req.completedAt && (
                            <p className="text-xs text-muted-foreground">اكتمل: {formatDateAr(req.completedAt)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <StatusBadge status={req.status} />
                        {req.slaStatus && req.slaStatus !== "on_track" && (
                          <span className="text-xs text-orange-600">{req.slaStatus === "warning" ? "⚠ تحذير مستوى الخدمة" : "⛔ تجاوز مستوى الخدمة"}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              return url ? <Link key={req.id} href={url}>{card}</Link> : card;
            })}
          </div>
        )
      ) : (
        leaveRequests.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Calendar size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">لا توجد طلبات إجازة</p>
              <Link href="/hr/leaves">
                <Button size="sm" variant="outline" className="mt-4 gap-1.5">
                  <Calendar size={14} />
                  طلب إجازة جديدة
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {leaveRequests.map((lr: any) => (
              <Card key={lr.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 bg-status-success-surface rounded-lg flex items-center justify-center flex-shrink-0">
                        <Calendar size={18} className="text-status-success-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{lr.leaveTypeName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateAr(lr.startDate)} — {formatDateAr(lr.endDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">{lr.days} {lr.days === 1 ? "يوم" : "أيام"}</p>
                      </div>
                    </div>
                    <StatusBadge status={lr.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </PageShell>
  );
}
