import { useState } from "react";
import { apiFetch, useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { MonitorSmartphone, LogOut } from "lucide-react";

// #2712 (الدفعة 2) — الأجهزة والجلسات النشطة: عرض + إنهاء.
type SessionRow = {
  id: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
};

// اشتقاق اسم ودود مختصر من User-Agent (عرض فقط، لا منطق).
function deviceLabel(ua: string | null): string {
  if (!ua) return "جهاز غير معروف";
  const os = /Windows/i.test(ua) ? "Windows"
    : /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux" : "نظام آخر";
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari" : "متصفّح";
  return `${browser} · ${os}`;
}

export function SessionsSection() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<{ data: SessionRow[] }>(["sessions"], "/auth/sessions");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyOthers, setBusyOthers] = useState(false);

  const sessions = data?.data ?? [];

  async function revoke(id: number) {
    setBusyId(id);
    try {
      await apiFetch(`/auth/sessions/${id}/revoke`, { method: "POST" });
      toast({ title: "تم إنهاء الجلسة" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "تعذّر إنهاء الجلسة" });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setBusyOthers(true);
    try {
      const res = await apiFetch<{ revoked: number }>("/auth/sessions/revoke-others", { method: "POST" });
      toast({ title: `تم إنهاء ${res.revoked} جلسة أخرى` });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "تعذّر إنهاء الجلسات" });
    } finally {
      setBusyOthers(false);
    }
  }

  const hasOthers = sessions.some((s) => !s.current);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-sky-500" />
          الأجهزة والجلسات النشطة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد جلسات نشطة.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {deviceLabel(s.userAgent)}
                      {s.current && <Badge variant="secondary">الجلسة الحالية</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" dir="ltr">
                      {s.ipAddress || "—"} · {formatDateAr(s.createdAt)}
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => revoke(s.id)}>
                      {busyId === s.id ? "…" : "إنهاء"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {hasOthers && (
              <Button size="sm" variant="destructive" disabled={busyOthers} onClick={revokeOthers}>
                <LogOut className="w-4 h-4 ms-1" /> {busyOthers ? "جاري…" : "إنهاء كل الجلسات الأخرى"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
