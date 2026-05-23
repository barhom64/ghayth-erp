import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Bell, BellDot, Check, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/formatters";

export default function Notifications() {
  const { data: notifResp, isLoading, isError } = useApiQuery<any>(["notifications"], "/notifications");
  const notifications = asList(notifResp);

  const markReadMut = useApiMutation<any, { id: number }>(
    (body) => `/notifications/${body.id}/read`,
    "PATCH",
    [["notifications"]],
    { successMessage: false }
  );
  const markingId = markReadMut.isPending ? markReadMut.variables?.id ?? null : null;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleMarkAsRead = (id: number) => {
    markReadMut.mutate({ id });
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'high': return <AlertCircle className="h-5 w-5 text-rose-500" />;
      case 'medium': return <BellDot className="h-5 w-5 text-status-warning" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <PageShell
      title="مركز الإشعارات"
      loading={isLoading}
      actions={
        <Badge variant="secondary" className="px-3 py-1 text-sm">
          {notifications?.filter((n: any) => !n.isRead).length || 0} إشعار جديد
        </Badge>
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
              {notifications?.map((notification: any) => (
                <div 
                  key={notification.id} 
                  className={`p-4 flex items-start gap-4 transition-colors hover:bg-muted/50 ${!notification.isRead ? 'bg-primary/5' : ''}`}
                >
                  <div className={`mt-1 p-2 rounded-full ${!notification.isRead ? 'bg-background shadow-sm border' : 'bg-muted'}`}>
                    {getPriorityIcon(notification.priority)}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium ${!notification.isRead ? 'text-foreground' : 'text-foreground/80'}`}>
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
                    
                    <div className="pt-2 flex gap-2">
                      {notification.type === 'leave_request' && (
                        <Badge variant="outline" className="bg-status-info-surface text-status-info-foreground dark:bg-blue-900/30">طلب إجازة</Badge>
                      )}
                      {notification.type === 'invoice' && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30">فاتورة</Badge>
                      )}
                    </div>
                  </div>

                  {!notification.isRead && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="shrink-0 text-muted-foreground hover:text-primary"
                      onClick={() => handleMarkAsRead(notification.id)}
                      disabled={markingId === notification.id}
                      title="تحديد كمقروء"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
