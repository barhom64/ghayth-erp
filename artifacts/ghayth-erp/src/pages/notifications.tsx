import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Bell, BellDot, Check, Clock, AlertCircle, Settings } from "lucide-react";
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

  // GET /notifications/preferences — per-user opt-in/out for the major
  // notification channels (email, sms, push). POST /notifications/preferences
  // saves the toggle change. Surfaced as a compact "تفضيلات" panel above
  // the inbox so the user can mute noisy categories without leaving the page.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsQ = useApiQuery<any>(["notifications-preferences"], "/notifications/preferences");
  // Server returns an array of {channel, category, enabled} rows; index
  // by channel for the per-channel switch UI below. Toggle posts a
  // single row to the server (it's an upsert; no need to send the
  // whole bag of preferences).
  const prefsList: any[] = Array.isArray(prefsQ.data?.data)
    ? prefsQ.data.data
    : Array.isArray(prefsQ.data?.preferences)
    ? prefsQ.data.preferences
    : Array.isArray(prefsQ.data)
    ? prefsQ.data
    : [];
  const enabledByChannel: Record<string, boolean> = {};
  for (const p of prefsList) {
    if (p?.channel && p?.category === "general") {
      enabledByChannel[p.channel] = Boolean(p.enabled);
    }
  }
  const savePrefsMut = useApiMutation<unknown, { channel: string; category: string; enabled: boolean }>(
    "/notifications/preferences",
    "POST",
    [["notifications-preferences"]],
    { successMessage: "تم حفظ التفضيلات" },
  );
  const togglePref = (channel: string, enabled: boolean) => {
    savePrefsMut.mutate({ channel, category: "general", enabled });
  };

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

  const prefChannels = [
    { key: "email", label: "البريد الإلكتروني" },
    { key: "sms", label: "رسائل SMS" },
    { key: "push", label: "إشعارات الجوال" },
    { key: "whatsapp", label: "واتساب" },
  ];

  return (
    <PageShell
      title="مركز الإشعارات"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مركز الإشعارات" },
      ]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrefsOpen((v) => !v)}>
            <Settings className="h-4 w-4 me-1" />
            تفضيلات
          </Button>
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            {notifications?.filter((n: any) => !n.isRead).length || 0} إشعار جديد
          </Badge>
        </div>
      }
    >
      {prefsOpen && (
        <Card className="mb-3 border-indigo-100 bg-indigo-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تفضيلات الإشعارات</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {prefChannels.map((ch) => (
              <div key={ch.key} className="flex items-center justify-between gap-2 border rounded p-2 bg-white">
                <span className="text-xs">{ch.label}</span>
                <Switch
                  checked={enabledByChannel[ch.key] ?? true}
                  onCheckedChange={(v) => togglePref(ch.key, v)}
                  disabled={savePrefsMut.isPending}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
