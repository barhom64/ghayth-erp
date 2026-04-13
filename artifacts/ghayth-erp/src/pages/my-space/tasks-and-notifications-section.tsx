import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTodo, Bell, ChevronLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo, priorityLabels } from "./shared";

interface TasksAndNotificationsSectionProps {
  todayTasks: any[];
  notifications: any[];
}

export function TasksAndNotificationsSection({ todayTasks, notifications }: TasksAndNotificationsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-blue-500" />
            مهامي اليوم
            {todayTasks.length > 0 && <Badge className="text-xs">{todayTasks.length}</Badge>}
          </CardTitle>
          <Link href="/tasks">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {todayTasks.length === 0 ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
              <p className="text-sm text-green-600">لا توجد مهام مجدولة لليوم</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((t: any) => (
                <Link key={t.id} href="/tasks">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      t.status === "completed" ? "bg-green-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                    )} />
                    <p className="text-sm font-medium text-gray-800 truncate flex-1">{t.title}</p>
                    {t.priority && (
                      <Badge variant="outline" className={cn("text-[10px] shrink-0",
                        t.priority === "high" ? "bg-red-100 text-red-700" : t.priority === "medium" ? "bg-yellow-100 text-yellow-700" : ""
                      )}>
                        {priorityLabels[t.priority] || t.priority}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-500" />
            تنبيهاتي
            {notifications.filter((n: any) => !n.isRead).length > 0 && (
              <Badge variant="destructive" className="text-xs">{notifications.filter((n: any) => !n.isRead).length}</Badge>
            )}
          </CardTitle>
          <Link href="/notifications">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-4">
              <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">لا توجد تنبيهات</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 6).map((n: any) => (
                <div key={n.id} className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg transition-colors",
                  !n.isRead ? "bg-blue-50/50" : "hover:bg-gray-50"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    n.priority === "high" || n.priority === "urgent" ? "bg-red-50" : "bg-blue-50"
                  )}>
                    <Bell className={cn("w-4 h-4", n.priority === "high" || n.priority === "urgent" ? "text-red-500" : "text-blue-500")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 truncate">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTimeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
