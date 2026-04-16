import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import {
  Timer, Clock, CheckCircle2, Loader2,
  DollarSign, Calendar, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "text-yellow-600 bg-yellow-50" },
  approved: { label: "معتمد", color: "text-green-600 bg-green-50" },
  rejected: { label: "مرفوض", color: "text-red-600 bg-red-50" },
  paid: { label: "مدفوع", color: "text-blue-600 bg-blue-50" },
};

const multiplierLabels: Record<string, string> = {
  "1.25": "عادي ×1.25",
  "1.50": "ليلي ×1.50",
  "1.5": "ليلي ×1.50",
  "2.00": "عطلة ×2.00",
  "2": "عطلة ×2.00",
};

function formatAmount(v: any): string {
  return Number(v ?? 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyOvertime() {
  const today = new Date();
  const [month, setMonth] = useState(today.toISOString().slice(0, 7));

  const { data, isLoading } = useApiQuery<any>(
    ["my-overtime", month],
    `/hr/overtime/my?month=${month}`
  );

  const records: any[] = data?.data ?? [];

  const totalHours = records.reduce((s: number, r: any) => s + Number(r.hours || 0), 0);
  const totalAmount = records.reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0);
  const approvedCount = records.filter((r: any) => r.status === "approved" || r.status === "paid").length;
  const pendingCount = records.filter((r: any) => r.status === "pending").length;

  return (
    <PageShell title="ساعاتي الإضافية" subtitle="متابعة ساعات العمل الإضافية والتعويضات">
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">الشهر:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "إجمالي الساعات", value: totalHours.toFixed(1), icon: Clock, color: "text-blue-600 bg-blue-50" },
          { label: "معتمدة", value: approvedCount, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "معلقة", value: pendingCount, icon: Timer, color: "text-yellow-600 bg-yellow-50" },
          { label: "إجمالي التعويض", value: `${formatAmount(totalAmount)} ر.س`, icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Timer size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد سجلات وقت إضافي لهذا الشهر</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">تفاصيل الوقت الإضافي</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الرقم</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">من</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">إلى</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الساعات</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">المضاعف</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">المبلغ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec: any) => {
                    const cfg = statusConfig[rec.status] ?? { label: rec.status, color: "text-gray-600 bg-gray-50" };
                    const mult = String(rec.multiplier ?? "1.25");
                    return (
                      <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-500">#{rec.overtimeNumber || rec.id}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDateAr(rec.date)}</td>
                        <td className="px-4 py-3 text-gray-700">{rec.startTime || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{rec.endTime || "—"}</td>
                        <td className="px-4 py-3 font-medium">{Number(rec.hours || 0).toFixed(1)} س</td>
                        <td className="px-4 py-3 text-gray-700">{multiplierLabels[mult] || `×${mult}`}</td>
                        <td className="px-4 py-3 font-medium text-emerald-600">{formatAmount(rec.totalAmount)} ر.س</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>

          <div className="border-t p-4 bg-gray-50/50">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">الإجمالي للشهر</span>
              <div className="flex gap-6">
                <span className="text-sm"><span className="font-bold">{totalHours.toFixed(1)}</span> ساعة</span>
                <span className="text-sm font-bold text-emerald-600">{formatAmount(totalAmount)} ر.س</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
