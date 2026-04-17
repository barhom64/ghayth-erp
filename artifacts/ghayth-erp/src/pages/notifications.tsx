import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellDot, Check, CheckCheck, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  leave_request: { label: "طلب إجازة", color: "bg-blue-50 text-blue-700" },
  leave_approved: { label: "إجازة معتمدة", color: "bg-green-50 text-green-700" },
  leave_rejected: { label: "إجازة مرفوضة", color: "bg-red-50 text-red-700" },
  leave_returned: { label: "إجازة مُرجعة", color: "bg-amber-50 text-amber-700" },
  invoice: { label: "فاتورة", color: "bg-emerald-50 text-emerald-700" },
  workflow_pending: { label: "طلب ينتظر موافقة", color: "bg-amber-50 text-amber-700" },
  workflow_approved: { label: "طلب معتمد", color: "bg-green-50 text-green-700" },
  workflow_rejected: { label: "طلب مرفوض", color: "bg-red-50 text-red-700" },
  onboarding_new_hire: { label: "تعيين جديد", color: "bg-purple-50 text-purple-700" },
  escalation: { label: "تصعيد", color: "bg-red-50 text-red-700" },
  sla_breach: { label: "تجاوز SLA", color: "bg-red-50 text-red-700" },
  violation: { label: "مخالفة", color: "bg-orange-50 text-orange-700" },
  absence: { label: "غياب", color: "bg-rose-50 text-rose-700" },
  task_assigned: { label: "مهمة", color: "bg-indigo-50 text-indigo-700" },
  approval_required: { label: "يتطلب اعتماد", color: "bg-amber-50 text-amber-700" },
};

function getNotificationLink(n: any): string | null {
  if (n.actionUrl) return n.actionUrl;
  if (n.refType && n.refId) {
    const links: Record<string, string> = {
      leave_request: `/hr/leaves`,
      hr_leave_requests: `/hr/leaves`,
      loan: `/hr/loans/${n.refId}`,
      hr_employee_loans: `/hr/loans/${n.refId}`,
      overtime: `/hr/overtime/${n.refId}`,
      hr_overtime_requests: `/hr/overtime/${n.refId}`,
      exit_request: `/hr/exit/${n.refId}`,
      hr_exit_requests: `/hr/exit/${n.refId}`,
      official_letter: `/hr/official-letters`,
      salary_advance: `/finance/salary-advances`,
      custody: `/finance/custodies/${n.refId}`,
      purchase_request: `/finance/purchase-orders/${n.refId}`,
      purchase_requests: `/finance/purchase-orders/${n.refId}`,
      invoice: `/finance/invoices/${n.refId}`,
      task: `/tasks/${n.refId}`,
      employee: `/employees/${n.refId}`,
      employee_violations: `/hr?tab=violations`,
      violation: `/hr?tab=violations`,
      ticket: `/support/${n.refId}`,
      support_ticket: `/support/${n.refId}`,
      contract: `/properties/contracts`,
      vehicle: `/fleet/${n.refId}`,
      unit: `/properties/${n.refId}`,
      project: `/projects/${n.refId}`,
      client: `/clients/${n.refId}`,
      legal_case: `/legal/cases/${n.refId}`,
      workflow: `/requests/workflows`,
      workflow_instance: `/requests/workflows`,
    };
    return links[n.refType] || null;
  }
  return null;
}

export default function Notifications() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: notifResp, isLoading } = useApiQuery<any>(["notifications"], "/notifications");
  const notifications = asList(notifResp);

  const markReadMut = useApiMutation<any, { id: number }>(
    (body) => `/notifications/${body.id}/read`,
    "PATCH",
    [["notifications"], ["notifications-unread-count"], ["notifications-bell"]],
    { successMessage: false }
  );
  const markingId = markReadMut.isPending ? markReadMut.variables?.id ?? null : null;

  const handleMarkAsRead = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    markReadMut.mutate({ id });
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/notifications/mark-all-read", { method: "PATCH" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
    } catch {}
  };

  const handleClick = (notification: any) => {
    if (!notification.isRead) {
      apiFetch(`/notifications/${notification.id}/read`, { method: "PATCH" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
        })
        .catch(() => {});
    }
    const link = getNotificationLink(notification);
    if (link) navigate(link);
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return <AlertCircle className="h-5 w-5 text-rose-500" />;
      case 'medium': return <BellDot className="h-5 w-5 text-amber-500" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  return (
    <PageShell
      title="مركز الإشعارات"
      loading={isLoading}
      actions={
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            {unreadCount} إشعار جديد
          </Badge>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1">
              <CheckCheck className="h-4 w-4" />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>
      }
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p>لا توجد إشعارات في الوقت الحالي</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications?.map((notification: any) => {
                const link = getNotificationLink(notification);
                const typeBadge = TYPE_BADGES[notification.type];
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={`w-full text-right p-4 flex items-start gap-4 transition-colors hover:bg-muted/50 ${!notification.isRead ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`mt-1 p-2 rounded-full ${!notification.isRead ? 'bg-background shadow-sm border' : 'bg-muted'}`}>
                      {getPriorityIcon(notification.priority)}
                    </div>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-medium truncate ${!notification.isRead ? 'text-foreground' : 'text-foreground/80'}`}>
                          {notification.title}
                        </p>
                        {notification.createdAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatDateAr(notification.createdAt)}
                          </span>
                        )}
                      </div>

                      {notification.body && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                      )}

                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        {typeBadge && (
                          <Badge variant="outline" className={`text-xs ${typeBadge.color}`}>
                            {typeBadge.label}
                          </Badge>
                        )}
                        {notification.requiresAck && !notification.acknowledgedAt && (
                          <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                            يتطلب إقرار
                          </Badge>
                        )}
                        {link && (
                          <span className="text-xs text-blue-500 flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" />
                            عرض التفاصيل
                          </span>
                        )}
                      </div>
                    </div>

                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-primary"
                        onClick={(e) => handleMarkAsRead(notification.id, e)}
                        disabled={markingId === notification.id}
                        title="تحديد كمقروء"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
