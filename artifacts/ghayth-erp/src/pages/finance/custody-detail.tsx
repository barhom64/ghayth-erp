import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, KeyRound, DollarSign, Clock, CheckCircle, XCircle, AlertTriangle, ArrowLeftRight, User } from "lucide-react";
import { formatCurrency , formatDateAr } from "@/lib/formatters";

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "نشطة", color: "bg-blue-100 text-blue-700" },
  partial: { label: "مسوّاة جزئياً", color: "bg-yellow-100 text-yellow-700" },
  settled: { label: "مسوّاة بالكامل", color: "bg-green-100 text-green-700" },
  pending: { label: "بانتظار الموافقة", color: "bg-orange-100 text-orange-700" },
  rejected: { label: "مرفوضة", color: "bg-red-100 text-red-700" },
  returned: { label: "مُرجعة", color: "bg-gray-100 text-gray-700" },
  overdue: { label: "متأخرة", color: "bg-red-100 text-red-700" },
};

const timelineIcons: Record<string, any> = {
  created: KeyRound,
  approved: CheckCircle,
  rejected: XCircle,
  returned: ArrowRight,
  settlement: ArrowLeftRight,
};

export default function CustodyDetailPage() {
  const [, params] = useRoute("/finance/custodies/:id");
  const id = params?.id;
  const { data, isLoading } = useApiQuery<any>(["custody-detail", id || ""], `/finance/custodies/${id}`, !!id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="p-12 text-center text-gray-400">
        <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>العهدة غير موجودة</p>
        <Link href="/finance/custodies">
          <Button variant="outline" className="mt-4">العودة للعهد</Button>
        </Link>
      </div>
    );
  }

  const st = statusMap[data.status] || statusMap.active;
  const progressPercent = data.amount > 0 ? Math.min(100, Math.round((data.settledAmount / data.amount) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance/custodies">
            <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4 me-1" />العهد</Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{data.ref}</h1>
          <Badge className={st.color}>{st.label}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><DollarSign className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">المبلغ الأصلي</p>
              <p className="text-xl font-bold">{formatCurrency(data.amount)}</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">المسوّى</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(data.settledAmount)}</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
            <div>
              <p className="text-xs text-gray-500">المتبقي</p>
              <p className="text-xl font-bold text-orange-600">{formatCurrency(data.remainingAmount)}</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><User className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">الموظف</p>
              <p className="text-lg font-bold">{data.employeeName || "-"}</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">تفاصيل العهدة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500 text-sm">المرجع</span>
              <span className="font-mono text-sm">{data.ref}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500 text-sm">الوصف</span>
              <span className="text-sm">{data.description || "-"}</span>
            </div>
            {data.purpose && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500 text-sm">الغرض</span>
                <span className="text-sm">{data.purpose}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500 text-sm">تاريخ الإنشاء</span>
              <span className="text-sm">{data.date ? formatDateAr(data.date) : "-"}</span>
            </div>
            {data.expectedReturnDate && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500 text-sm">تاريخ الإرجاع المتوقع</span>
                <span className={`text-sm ${data.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>
                  {formatDateAr(data.expectedReturnDate)}
                  {data.daysOverdue > 0 && ` (متأخر ${data.daysOverdue} يوم)`}
                </span>
              </div>
            )}
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">نسبة التسوية</span>
                <span className="font-semibold">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${progressPercent >= 100 ? "bg-green-500" : progressPercent > 0 ? "bg-yellow-500" : "bg-gray-300"}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">سجل التسويات</CardTitle></CardHeader>
          <CardContent>
            {(!data.settlements || data.settlements.length === 0) ? (
              <div className="text-center text-gray-400 py-6">
                <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد تسويات بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.settlements.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <p className="font-mono text-xs text-blue-600">{s.ref}</p>
                      <p className="text-sm text-gray-500">{s.date ? formatDateAr(s.date) : ""}</p>
                      {s.settledByName && <p className="text-xs text-gray-400">بواسطة: {s.settledByName}</p>}
                    </div>
                    <p className="font-semibold text-green-600">{formatCurrency(Number(s.amount))}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.timeline && data.timeline.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">المسار الزمني</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute top-0 bottom-0 start-4 w-0.5 bg-gray-200" />
              <div className="space-y-4">
                {data.timeline.map((event: any, i: number) => {
                  const Icon = timelineIcons[event.action] || Clock;
                  const isLast = i === data.timeline.length - 1;
                  return (
                    <div key={i} className="relative flex gap-4 items-start">
                      <div className={`relative z-10 flex-shrink-0 p-1.5 rounded-full border-2 bg-white ${
                        event.action === "created" ? "border-blue-400" :
                        event.action === "approved" ? "border-green-400" :
                        event.action === "rejected" ? "border-red-400" :
                        event.action === "settlement" ? "border-yellow-400" :
                        "border-gray-300"
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{event.label}</p>
                          {event.amount && (
                            <Badge variant="outline" className="text-xs">{formatCurrency(event.amount)}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {event.date ? `${formatDateAr(event.date)} ${new Date(event.date).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </p>
                        {event.actionBy && <p className="text-xs text-gray-500 mt-0.5">بواسطة: {event.actionBy}</p>}
                        {event.settledBy && <p className="text-xs text-gray-500 mt-0.5">بواسطة: {event.settledBy}</p>}
                        {event.notes && <p className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded">{event.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
