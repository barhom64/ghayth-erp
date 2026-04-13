import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Calendar, ChevronLeft } from "lucide-react";
import { formatTimeAgo } from "./shared";

interface PendingApprovalsCardProps {
  pendingApprovals: any[];
  role: string | undefined;
}

export function PendingApprovalsCard({ pendingApprovals, role }: PendingApprovalsCardProps) {
  if (role === "employee" || pendingApprovals.length === 0) return null;
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-500" />
          موافقاتي المعلقة
          <Badge variant="destructive" className="text-xs">{pendingApprovals.length}</Badge>
        </CardTitle>
        <Link href="/action-center">
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            مركز القرارات <ChevronLeft className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pendingApprovals.slice(0, 5).map((a: any) => (
            <Link key={`${a.type}-${a.id}`} href="/hr/leaves">
              <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">طلب إجازة - {a.employeeName}</p>
                  <p className="text-xs text-gray-500">{a.title}</p>
                </div>
                <span className="text-xs text-gray-400">{a.createdAt ? formatTimeAgo(a.createdAt) : ""}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
