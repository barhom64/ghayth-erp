/**
 * /comms/correspondence — صفحة إدارة المراسلات (صادر/وارد)
 *
 * تعرض جدول المراسلات مع فلاتر الاتجاه والحالة، وإحصائيات ملخصة،
 * وإجراءات سريعة (إرسال، ردّ، عرض التفاصيل).
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  Send,
  Reply,
  Eye,
  Mail,
  MailOpen,
  FileText,
  Inbox,
  SendHorizonal,
} from "lucide-react";

// ───────────────────────── Types ─────────────────────────

interface Correspondence {
  id: number;
  ref: string;
  direction: "outgoing" | "incoming";
  subject: string;
  senderName?: string;
  senderOrg?: string;
  recipientName?: string;
  recipientOrg?: string;
  status: "draft" | "sent";
  createdAt: string;
}

interface CorrespondenceStats {
  totalOutgoing: number;
  totalIncoming: number;
  totalDraft: number;
  totalSent: number;
  totalPending: number;
}

// ───────────────────────── Helpers ─────────────────────────

function formatDateAr(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "outgoing") {
    return (
      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
        صادر
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
      وارد
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "draft") {
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-600">
        مسودة
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
      مرسل
    </Badge>
  );
}

// ───────────────────────── Main Component ─────────────────────────

export default function CorrespondencePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch correspondence list
  const {
    data: corrResp,
    isLoading,
    isError,
  } = useApiQuery<{ data: Correspondence[]; total: number }>(
    ["correspondence"],
    "/correspondence",
  );
  const items = corrResp?.data || [];

  // Fetch summary stats
  const { data: stats } = useApiQuery<CorrespondenceStats>(
    ["correspondence-stats"],
    "/correspondence/stats/summary",
  );

  // Send mutation
  const sendMut = useApiMutation<unknown, void>(
    "",
    "POST",
    [["correspondence"]],
  );

  // Respond mutation
  const respondMut = useApiMutation<unknown, void>(
    "",
    "POST",
    [["correspondence"]],
  );

  // Apply filters
  const filtered = useMemo(() => {
    let result = items;
    if (directionFilter !== "all") {
      result = result.filter((item) => item.direction === directionFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }
    return result;
  }, [items, directionFilter, statusFilter]);

  // KPI stats
  const kpis = useMemo(() => {
    return [
      {
        label: "صادر",
        value: stats?.totalOutgoing ?? items.filter((i) => i.direction === "outgoing").length,
        icon: SendHorizonal,
        color: "text-blue-600 bg-blue-50",
      },
      {
        label: "وارد",
        value: stats?.totalIncoming ?? items.filter((i) => i.direction === "incoming").length,
        icon: Inbox,
        color: "text-green-600 bg-green-50",
      },
      {
        label: "مسودة",
        value: stats?.totalDraft ?? items.filter((i) => i.status === "draft").length,
        icon: FileText,
        color: "text-gray-600 bg-gray-50",
      },
      {
        label: "مرسل",
        value: stats?.totalSent ?? items.filter((i) => i.status === "sent").length,
        icon: Send,
        color: "text-emerald-600 bg-emerald-50",
      },
      {
        label: "معلّق",
        value: stats?.totalPending ?? 0,
        icon: Mail,
        color: "text-amber-600 bg-amber-50",
      },
    ];
  }, [stats, items]);

  const handleSend = (id: number) => {
    sendMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "تم إرسال المراسلة بنجاح" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "حدث خطأ أثناء الإرسال", description: err?.message });
      },
      // @ts-ignore — dynamic endpoint override
      endpoint: `/correspondence/${id}/send`,
    } as any);
  };

  const handleRespond = (id: number) => {
    respondMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "تم إنشاء الرد بنجاح" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الرد", description: err?.message });
      },
      // @ts-ignore — dynamic endpoint override
      endpoint: `/correspondence/${id}/respond`,
    } as any);
  };

  // ───────────── Loading / Error states ─────────────

  if (isLoading) {
    return (
      <div className="p-6" dir="rtl">
        <Card>
          <CardContent className="py-12">
            <LoadingSpinner />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6" dir="rtl">
        <ErrorState onRetry={() => window.location.reload()} />
      </div>
    );
  }

  // ───────────── Render ─────────────

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">المراسلات</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة المراسلات الصادرة والواردة</p>
        </div>
        <Link href="/correspondence/create">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            مراسلة جديدة
          </Button>
        </Link>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color.split(" ")[1]}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">الاتجاه:</span>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="outgoing">صادر</SelectItem>
                  <SelectItem value="incoming">وارد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">الحالة:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="sent">مرسل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mr-auto text-sm text-gray-500">
              {filtered.length} نتيجة
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الرقم المرجعي</TableHead>
                <TableHead className="text-right">الاتجاه</TableHead>
                <TableHead className="text-right">الموضوع</TableHead>
                <TableHead className="text-right">المرسل</TableHead>
                <TableHead className="text-right">المستلم</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right w-[60px]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-400">
                    <MailOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p>لا توجد مراسلات</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/correspondence/${item.id}`)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                        {item.ref || `#${item.id}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DirectionBadge direction={item.direction} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{item.subject || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span>{item.senderName || "-"}</span>
                        {item.senderOrg && (
                          <span className="text-xs text-gray-400 block">{item.senderOrg}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span>{item.recipientName || "-"}</span>
                        {item.recipientOrg && (
                          <span className="text-xs text-gray-400 block">{item.recipientOrg}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{formatDateAr(item.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/correspondence/${item.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 me-2" />
                            عرض التفاصيل
                          </DropdownMenuItem>
                          {item.status === "draft" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSend(item.id);
                              }}
                            >
                              <Send className="h-4 w-4 me-2" />
                              إرسال
                            </DropdownMenuItem>
                          )}
                          {item.status === "sent" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRespond(item.id);
                              }}
                            >
                              <Reply className="h-4 w-4 me-2" />
                              رد
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
