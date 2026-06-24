import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageShell } from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Fuel, Wrench, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// بوابة السائق — البلاغات الميدانية: تعبئة وقود / عطل / حادث. تستهلك نقاط
// /fleet/me/{fuel-logs,breakdowns,accidents}. كل بلاغ يُسنَد للسائق تلقائيًا
// خلفيًا (driverId من الجلسة) ويُشغّل المعالجة الإدارية (مهمة/صيانة/إشعار).

const BREAKDOWN_CATEGORIES = [
  ["engine", "محرّك"], ["tire", "إطارات"], ["electrical", "كهرباء"], ["brakes", "فرامل"],
  ["transmission", "ناقل حركة"], ["cooling", "تبريد"], ["bodywork", "هيكل"], ["other", "أخرى"],
] as const;
const BREAKDOWN_SEVERITY = [["low", "منخفض"], ["medium", "متوسط"], ["high", "عالٍ"], ["critical", "حرج"]] as const;
const ACCIDENT_SEVERITY = [["minor", "بسيط"], ["moderate", "متوسط"], ["severe", "جسيم"], ["total_loss", "خسارة كلية"]] as const;

interface ReportRow { id: number; plateNumber?: string | null; reportedAt?: string | null; occurredAt?: string | null; fuelDate?: string | null; status?: string | null; severity?: string | null; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function MeDriverReports() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"fuel" | "breakdown" | "accident">("fuel");
  const [busy, setBusy] = useState(false);

  const fuelQ = useApiQuery<{ data: ReportRow[] }>(["fleet-me-fuel-logs"], "/fleet/me/fuel-logs");
  const bdQ = useApiQuery<{ data: ReportRow[] }>(["fleet-me-breakdowns"], "/fleet/me/breakdowns");
  const accQ = useApiQuery<{ data: ReportRow[] }>(["fleet-me-accidents"], "/fleet/me/accidents");

  // نماذج مستقلة
  // #1733 finance-blackout: السائق يبلّغ وقائع تشغيلية فقط (لتر/محطة/عدّاد) —
  // لا تسعير. المالية/المدير تُسعّر التعبئة لاحقًا.
  const [fuel, setFuel] = useState({ vehiclePlate: "", liters: "", stationName: "", mileageAtFuel: "" });
  const [bd, setBd] = useState({ vehiclePlate: "", category: "engine", severity: "medium", description: "" });
  const [acc, setAcc] = useState({ vehiclePlate: "", severity: "minor", locationText: "", description: "", hasInjuries: false });

  async function submit(path: string, body: Record<string, unknown>, okMsg: string, invalidate: string, reset: () => void) {
    setBusy(true);
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      qc.invalidateQueries({ queryKey: [invalidate] });
      toast({ title: okMsg });
      reset();
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر إرسال البلاغ", description: getErrorMessage(err) });
    } finally { setBusy(false); }
  }

  const recent = (rows: ReportRow[] | undefined, dateKey: keyof ReportRow) => (
    <div className="mt-4 space-y-1">
      <div className="text-xs text-muted-foreground">آخر البلاغات</div>
      {(!rows || rows.length === 0) && <div className="text-xs text-muted-foreground">لا بلاغات بعد.</div>}
      {rows?.slice(0, 5).map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded border p-2 text-xs">
          <span>{r.plateNumber ?? "—"}</span>
          <span className="text-muted-foreground">{String(r[dateKey] ?? "").slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <PageShell
      title="بلاغات السائق"
      breadcrumbs={[{ href: "/me/driver", label: "السائق" }, { label: "البلاغات" }]}
      actions={<Button asChild variant="outline" size="sm"><Link href="/me/driver">رجوع</Link></Button>}
    >
      <FleetTabsNav />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="fuel"><Fuel className="ms-1 h-4 w-4" /> وقود</TabsTrigger>
          <TabsTrigger value="breakdown"><Wrench className="ms-1 h-4 w-4" /> عطل</TabsTrigger>
          <TabsTrigger value="accident"><AlertTriangle className="ms-1 h-4 w-4" /> حادث</TabsTrigger>
        </TabsList>

        {/* وقود */}
        <TabsContent value="fuel">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">تسجيل تعبئة وقود</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم اللوحة"><Input value={fuel.vehiclePlate} onChange={(e) => setFuel({ ...fuel, vehiclePlate: e.target.value })} /></Field>
                <Field label="عدد اللترات"><Input type="number" value={fuel.liters} onChange={(e) => setFuel({ ...fuel, liters: e.target.value })} /></Field>
                <Field label="المحطة"><Input value={fuel.stationName} onChange={(e) => setFuel({ ...fuel, stationName: e.target.value })} /></Field>
                <Field label="قراءة العدّاد"><Input type="number" value={fuel.mileageAtFuel} onChange={(e) => setFuel({ ...fuel, mileageAtFuel: e.target.value })} /></Field>
              </div>
              <Button
                disabled={busy || !fuel.vehiclePlate || !fuel.liters}
                onClick={() => submit("/fleet/me/fuel-logs",
                  { vehiclePlate: fuel.vehiclePlate, liters: Number(fuel.liters), stationName: fuel.stationName || undefined, mileageAtFuel: Number(fuel.mileageAtFuel) || undefined },
                  "تم تسجيل تعبئة الوقود", "fleet-me-fuel-logs",
                  () => setFuel({ vehiclePlate: "", liters: "", stationName: "", mileageAtFuel: "" }))}
              >إرسال</Button>
              {recent(fuelQ.data?.data, "fuelDate")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* عطل */}
        <TabsContent value="breakdown">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">الإبلاغ عن عطل</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم اللوحة"><Input value={bd.vehiclePlate} onChange={(e) => setBd({ ...bd, vehiclePlate: e.target.value })} /></Field>
                <Field label="نوع العطل">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={bd.category} onChange={(e) => setBd({ ...bd, category: e.target.value })}>
                    {BREAKDOWN_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="الخطورة">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={bd.severity} onChange={(e) => setBd({ ...bd, severity: e.target.value })}>
                    {BREAKDOWN_SEVERITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="الوصف"><Textarea value={bd.description} onChange={(e) => setBd({ ...bd, description: e.target.value })} /></Field>
              <Button
                disabled={busy || !bd.vehiclePlate || bd.description.trim().length < 3}
                onClick={() => submit("/fleet/me/breakdowns",
                  { vehiclePlate: bd.vehiclePlate, category: bd.category, severity: bd.severity, description: bd.description },
                  "تم إرسال بلاغ العطل", "fleet-me-breakdowns",
                  () => setBd({ vehiclePlate: "", category: "engine", severity: "medium", description: "" }))}
              >إرسال</Button>
              {recent(bdQ.data?.data, "reportedAt")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* حادث */}
        <TabsContent value="accident">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">الإبلاغ عن حادث</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم اللوحة"><Input value={acc.vehiclePlate} onChange={(e) => setAcc({ ...acc, vehiclePlate: e.target.value })} /></Field>
                <Field label="الجسامة">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={acc.severity} onChange={(e) => setAcc({ ...acc, severity: e.target.value })}>
                    {ACCIDENT_SEVERITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="الموقع"><Input value={acc.locationText} onChange={(e) => setAcc({ ...acc, locationText: e.target.value })} /></Field>
              </div>
              <Field label="الوصف"><Textarea value={acc.description} onChange={(e) => setAcc({ ...acc, description: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={acc.hasInjuries} onChange={(e) => setAcc({ ...acc, hasInjuries: e.target.checked })} />
                يوجد إصابات
              </label>
              <Button
                variant={acc.hasInjuries ? "destructive" : "default"}
                disabled={busy || !acc.vehiclePlate || acc.description.trim().length < 3}
                onClick={() => submit("/fleet/me/accidents",
                  { vehiclePlate: acc.vehiclePlate, severity: acc.severity, locationText: acc.locationText || undefined, description: acc.description, hasInjuries: acc.hasInjuries },
                  "تم إرسال بلاغ الحادث", "fleet-me-accidents",
                  () => setAcc({ vehiclePlate: "", severity: "minor", locationText: "", description: "", hasInjuries: false }))}
              >إرسال البلاغ</Button>
              {recent(accQ.data?.data, "occurredAt")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
