import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Clock, User } from "lucide-react";

const DOC_LABELS: Record<string, string> = {
  work_permit: "تصريح عمل",
  iqama: "إقامة",
  passport: "جواز سفر",
  contract: "عقد عمل",
};

const DOC_COLORS: Record<string, string> = {
  work_permit: "bg-blue-100 text-blue-700",
  iqama: "bg-purple-100 text-purple-700",
  passport: "bg-green-100 text-green-700",
  contract: "bg-orange-100 text-orange-700",
};

function getSeverity(days: number) {
  if (days <= 0) return { label: "منتهي", color: "bg-red-100 text-red-700", sort: 0 };
  if (days <= 14) return { label: `${days} يوم`, color: "bg-red-100 text-red-700", sort: 1 };
  if (days <= 30) return { label: `${days} يوم`, color: "bg-orange-100 text-orange-700", sort: 2 };
  if (days <= 60) return { label: `${days} يوم`, color: "bg-yellow-100 text-yellow-700", sort: 3 };
  return { label: `${days} يوم`, color: "bg-gray-100 text-gray-600", sort: 4 };
}

export default function ExpiringDocumentsPage() {
  const [days, setDays] = useState("90");
  const [docFilter, setDocFilter] = useState("all");

  const { data, isLoading } = useApiQuery<any>(
    ["expiring-documents", days],
    `/hr/expiring-documents?days=${days}`
  );
  const allDocs = asList(data?.data || data);
  const docs = docFilter === "all" ? allDocs : allDocs.filter((d: any) => d.docType === docFilter);

  const criticalCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 14).length;
  const expiredCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 0).length;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-xl font-bold">متابعة الوثائق المنتهية</h1>
            <p className="text-sm text-gray-500">تتبع تصاريح العمل، الإقامات، جوازات السفر والعقود</p>
          </div>
          {criticalCount > 0 && <Badge className="bg-red-100 text-red-700">{criticalCount} حرج</Badge>}
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="14">14 يوم</SelectItem>
              <SelectItem value="30">30 يوم</SelectItem>
              <SelectItem value="60">60 يوم</SelectItem>
              <SelectItem value="90">90 يوم</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docFilter} onValueChange={setDocFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوثائق</SelectItem>
              {Object.entries(DOC_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {expiredCount > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          تحذير: {expiredCount} وثيقة منتهية الصلاحية — يجب التجديد فوراً
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {Object.entries(DOC_LABELS).map(([type, label]) => {
          const count = allDocs.filter((d: any) => d.docType === type).length;
          return (
            <Card key={type} className="cursor-pointer hover:shadow-md" onClick={() => setDocFilter(docFilter === type ? "all" : type)}>
              <CardContent className="p-3 text-center">
                <div className={`text-xl font-bold ${count > 0 ? "text-primary" : "text-gray-300"}`}>{count}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
      ) : docs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-400">لا توجد وثائق منتهية في هذه الفترة</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: any, i: number) => {
            const severity = getSeverity(Number(doc.daysLeft));
            const isExpired = Number(doc.daysLeft) <= 0;
            return (
              <Card key={i} className={`transition-shadow hover:shadow-md ${isExpired ? "border-red-200 bg-red-50/30" : Number(doc.daysLeft) <= 14 ? "border-orange-200" : ""}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${DOC_COLORS[doc.docType] || "bg-gray-100 text-gray-600"}`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">{doc.employeeName}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Badge className={DOC_COLORS[doc.docType] || "bg-gray-100 text-gray-600"}>{DOC_LABELS[doc.docType] || doc.docLabel}</Badge>
                        <span>ينتهي: {doc.expiryDate?.split("T")[0]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpired
                      ? <Badge className="bg-red-100 text-red-700">منتهي</Badge>
                      : (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <Badge className={severity.color}>{severity.label}</Badge>
                        </div>
                      )
                    }
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
