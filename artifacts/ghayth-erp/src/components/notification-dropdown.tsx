import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellDot, Check, CheckCheck, Clock, AlertCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export function NotificationDropdown() {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifResp } = useApiQuery<any>(["notifications-bell"], "/notifications?limit=8");
  const { data: countResp } = useApiQuery<{ count: number }>(
    ["notifications-unread-count"],
    "/notifications/unread-count"
  );
  const notifications = asList(notifResp);
  const unreadCount = countResp?.count ?? notifications.filter((n: any) => !n.isRead).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  };

  const markAsRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      invalidate();
    } catch {}
  };

  const markAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch("/notifications/mark-all-read", { method: "PATCH" });
      invalidate();
    } catch {}
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      apiFetch(`/notifications/${notification.id}/read`, { method: "PATCH" })
        .then(() => invalidate())
        .catch(() => {});
    }
    const link = getNotificationLink(notification);
    if (link) {
      navigate(link);
      setIsOpen(false);
    }
  };

  const getNotificationLink = (n: any): string => {
    if (n.actionUrl) return n.actionUrl;
    if (n.refType && n.refId) {
      const links: Record<string, string> = {
        leave_request: `/hr/leaves`,
        invoice: `/finance/invoices/${n.refId}`,
        task: `/tasks/${n.refId}`,
        employee: `/employees/${n.refId}`,
        ticket: `/support/${n.refId}`,
        contract: `/properties/contracts`,
        vehicle: `/fleet/${n.refId}`,
        unit: `/properties/${n.refId}`,
        project: `/projects/${n.refId}`,
        client: `/clients/${n.refId}`,
        pilgrim: `/umrah?tab=pilgrims`,
      };
      return links[n.refType] || "/notifications";
    }
    return "/notifications";
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
      case "urgent":
        return "text-rose-500 bg-rose-50";
      case "medium":
        return "text-amber-500 bg-amber-50";
      default:
        return "text-blue-500 bg-blue-50";
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-4 w-4 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute top-full mt-2 end-0 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[420px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">الإشعارات</h3>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5">{unreadCount}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-0.5"
                  title="تعليم الكل كمقروء"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  الكل
                </button>
              )}
              <button
                onClick={() => { navigate("/notifications"); setIsOpen(false); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">لا توجد إشعارات</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.slice(0, 8).map((n: any) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "w-full text-right px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50",
                      !n.isRead && "bg-blue-50/40"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", getPriorityColor(n.priority))}>
                      {n.priority === "high" || n.priority === "urgent" ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : n.priority === "medium" ? (
                        <BellDot className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm truncate", !n.isRead ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {n.createdAt ? formatTimeAgo(n.createdAt) : ""}
                      </p>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => markAsRead(n.id, e)}
                        className="shrink-0 p-1 rounded hover:bg-blue-100 text-blue-500 transition-colors"
                        title="تحديد كمقروء"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
