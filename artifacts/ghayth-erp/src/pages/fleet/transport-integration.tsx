import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@workspace/ui-core";
import {
  Calendar, Users, FileText, ArrowLeft, Wand2, CheckCircle2,
  AlertCircle, Plus, ExternalLink,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { todayLocal } from "@/lib/formatters";

// #1812 governing comment — تكامل النقل مع النظام كاملاً وليس جزيرة.
// This page is the operator's "what's connected but not yet
// materialized" view: lists umrah groups + rental contracts that have
// transport demand but no transport_bookings rows linked back, and
// offers a one-click "materialize" action.

interface UmrahGroupSource {
  id: number;
  nuskGroupNumber: string;
  name: string | null;
  mutamerCount: number;
  programDuration: number | null;
  seasonStartDate: string | null;
  seasonEndDate: string | null;
  existingBookings: number;
}

interface RentalContractSource {
  id: number;
  contractNumber: string;
  customerId: number | null;
  customerName: string | null;
  startDate: string | null;
  endDate: string | null;
  existingBookings: number;
}

interface LinkedSourcesData {
  fromDate: string;
  toDate: string;
  umrahGroups: UmrahGroupSource[];
  rentalContracts: RentalContractSource[];
  counts: {
    umrahGroupsTotal: number;
    umrahGroupsNeedTransport: number;
    rentalContractsTotal: number;
    rentalContractsNeedTransport: number;
  };
}

export default function TransportIntegration() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fromDate, setFromDate] = useState<string>(todayLocal());
  const [toDate, setToDate] = useState<string>(() => {
    // Local-calendar "today + 30d" — uses Intl.DateTimeFormat with the
    // en-CA locale to render an ISO-like yyyy-mm-dd string in the
    // browser's local timezone. Avoids both the UTC-slice trap and
    // the bound-getFullYear period-drift lint.
    const d = new Date(Date.now() + 30 * 86_400_000);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(d);
  });
  const [materializingId, setMaterializingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: LinkedSourcesData }>(
    ["transport-linked-sources", fromDate, toDate],
    `/transport/integration/linked-sources?fromDate=${fromDate}&toDate=${toDate}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;

  const dash = data.data;

  const materializeUmrah = async (group: UmrahGroupSource) => {
    if (!confirm(
      `سيتم إنشاء 3 حجوزات للمجموعة "${group.nuskGroupNumber}":\n` +
      `- وصول إلى مكة\n- مكة → المدينة\n- المدينة → المغادرة\n\n` +
      `(عدد المعتمرين: ${group.mutamerCount}). متابعة؟`,
    )) return;
    setMaterializingId(group.id);
    try {
      const res = await apiFetch<{ data: { created: { id: number }[]; skipped: string[] } }>(
        `/transport/integration/from-umrah-group/${group.id}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const createdIds = res?.data?.created?.map((c) => c.id) ?? [];
      const skippedCount = res?.data?.skipped?.length ?? 0;
      toast({
        title: `تم إنشاء ${createdIds.length} حجزاً`,
        description: skippedCount > 0
          ? `تم تجاوز ${skippedCount} حجز كان موجوداً مسبقاً.`
          : undefined,
      });
      // Auto-trigger bulk planning if anything was created.
      if (createdIds.length > 0 && confirm(
        `هل تريد التخطيط الفوري؟ سيقوم النظام باقتراح المركبة والسائق وإنشاء أوامر التوزيع لـ ${createdIds.length} حجزاً.`,
      )) {
        await runBulkPlanning(createdIds);
      }
      qc.invalidateQueries({ queryKey: ["transport-linked-sources", fromDate, toDate] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر إنشاء الحجوزات", description: message });
    } finally {
      setMaterializingId(null);
    }
  };

  // Bulk-plan endpoint — runs suggest-assignment on each booking +
  // creates dispatch orders for the top non-blocked candidate.
  const runBulkPlanning = async (bookingIds: number[]) => {
    try {
      const res = await apiFetch<{ data: { summary: {
        total: number; planned: number; needsAttention: number;
        noCandidate: number; noLine: number; skipped: number;
      } } }>("/transport/integration/plan-bookings", {
        method: "POST",
        body: JSON.stringify({ bookingIds }),
      });
      const s = res?.data?.summary;
      if (!s) return;
      toast({
        title: `تم تخطيط ${s.planned} من ${s.total} حجوزات`,
        description: s.needsAttention > 0
          ? `${s.needsAttention} يحتاج تدخلاً يدوياً — افتح لوحة التوزيع لإكمالها.`
          : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التخطيط", description: message });
    }
  };

  const calendarUrl = `/api/transport/integration/calendar.ics?fromDate=${fromDate}&toDate=${toDate}`;

  return (
    <PageShell
      title="تكامل النقل مع النظام"
      subtitle="مصادر الحجوزات: عمرة، عقود تأجير، مشاريع — يقترح النظام إنشاء الحجوزات تلقائياً من مصادرها"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "التكامل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <a href={calendarUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 me-1" />تنزيل تقويم iCalendar
            </Button>
          </a>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/bookings">
              <ArrowLeft className="h-4 w-4 me-1" />العودة للحجوزات
            </Link></Button>
        </div>
      }
    >
      <FleetTabsNav />

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-muted-foreground">من</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm"
            />
            <span className="text-xs text-muted-foreground">إلى</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <div className="text-xs text-muted-foreground ms-auto">
              {dash.counts.umrahGroupsNeedTransport + dash.counts.rentalContractsNeedTransport} مصدر بحاجة لحجوزات نقل
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Umrah Groups */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-status-info-foreground" />
            مجموعات العمرة
            <span className="ms-auto text-xs font-normal text-muted-foreground">
              {dash.counts.umrahGroupsNeedTransport} بحاجة لنقل / {dash.counts.umrahGroupsTotal} في الفترة
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {dash.umrahGroups.length === 0 ? (
            <div className="text-xs text-center py-4 text-muted-foreground">
              لا توجد مجموعات عمرة في هذه الفترة
            </div>
          ) : (
            dash.umrahGroups.map((g) => {
              const isMaterialized = g.existingBookings > 0;
              return (
                <div
                  key={g.id}
                  className={`p-3 rounded-md border ${
                    isMaterialized
                      ? "bg-status-success-surface border-status-success-foreground/30"
                      : "bg-status-warning-surface border-status-warning-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{g.nuskGroupNumber}</span>
                      {g.name && <span className="text-xs text-muted-foreground">— {g.name}</span>}
                      <Badge variant="outline" className="text-[10px]">
                        {g.mutamerCount} معتمر
                      </Badge>
                    </div>
                    {isMaterialized ? (
                      <Badge className="bg-status-success-surface text-status-success-foreground inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {g.existingBookings} حجز مرتبط
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => materializeUmrah(g)}
                        disabled={materializingId === g.id}
                        rateLimitAware
                      >
                        <Wand2 className="h-3.5 w-3.5 me-1" />
                        {materializingId === g.id ? "جاري الإنشاء…" : "إنشاء حجوزات النقل"}
                      </Button>
                    )}
                  </div>
                  {(g.seasonStartDate || g.seasonEndDate) && (
                    <div className="text-xs text-muted-foreground">
                      الموسم: {g.seasonStartDate ?? "—"} → {g.seasonEndDate ?? "—"}
                      {g.programDuration != null && (
                        <span className="ms-2">({g.programDuration} يوم)</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Rental Contracts */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-status-info-foreground" />
            عقود تأجير نشطة
            <span className="ms-auto text-xs font-normal text-muted-foreground">
              {dash.counts.rentalContractsNeedTransport} بحاجة لنقل / {dash.counts.rentalContractsTotal} نشط
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {dash.rentalContracts.length === 0 ? (
            <div className="text-xs text-center py-4 text-muted-foreground">
              لا توجد عقود تأجير نشطة في هذه الفترة
            </div>
          ) : (
            dash.rentalContracts.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-md border ${
                  c.existingBookings > 0
                    ? "bg-status-success-surface border-status-success-foreground/30"
                    : "bg-surface-subtle"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono font-medium">{c.contractNumber}</div>
                    {c.customerName && (
                      <div className="text-xs text-muted-foreground">{c.customerName}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {c.startDate ?? "—"} → {c.endDate ?? "—"}
                    </div>
                  </div>
                  {c.existingBookings > 0 ? (
                    <Badge className="bg-status-success-surface text-status-success-foreground inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {c.existingBookings} حجز مرتبط
                    </Badge>
                  ) : (
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      لا توجد حجوزات نقل
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Manual booking fallback link */}
      <Card className="mt-3 border-dashed">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <ExternalLink className="h-3 w-3" />
          إذا لم يكن المصدر مرتبطاً بالنظام، يمكنك إنشاء الحجز يدوياً.
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs"><Link href="/fleet/transport/bookings/create">
              <Plus className="h-3 w-3 me-1" />حجز يدوي جديد
            </Link></Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
