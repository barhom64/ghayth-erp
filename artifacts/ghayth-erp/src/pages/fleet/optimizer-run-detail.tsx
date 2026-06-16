/**
 * TA-T18-VRP Phase 2 — Fleet Optimizer run detail (SPA).
 *
 * Shows the proposed plan from one optimisation run + lets the
 * dispatcher approve or reject. Approve re-validates each assignment
 * through the backend; reject requires a reason.
 */

import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

interface Assignment {
  bookingLineId: number;
  vehicleId: number;
  driverId: number | null;
  distanceMeters: number;
  sequenceOrder: number;
  reason: string;
}

interface Run {
  id: number;
  runDate: string;
  status: string;
  algorithm: string | null;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  solveDurationMs: number | null;
  assignmentsJson: Assignment[] | null;
  unassignedJson: number[] | null;
  errorMessage: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

interface DetailResponse {
  data: Run;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: "قيد الحساب",     color: "bg-slate-100 text-slate-700" },
  solved:             { label: "بانتظار المراجعة", color: "bg-amber-100 text-amber-800" },
  approved:           { label: "موافق عليه",     color: "bg-emerald-100 text-emerald-700" },
  partially_approved: { label: "موافقة جزئية",   color: "bg-sky-100 text-sky-700" },
  rejected:           { label: "مرفوض",          color: "bg-rose-100 text-rose-700" },
  failed:             { label: "فشل",            color: "bg-rose-100 text-rose-700" },
};

export default function OptimizerRunDetailPage() {
  const [, params] = useRoute<{ id: string }>("/fleet/optimizer/runs/:id");
  const runId = params?.id;
  const { data, isLoading } = useApiQuery<DetailResponse>(
    ["fleet-optimizer-run", runId ?? ""],
    runId ? `/fleet/optimizer/runs/${runId}` : null,
  );

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const approveMut = useApiMutation<unknown, Record<string, never>>(
    `/fleet/optimizer/runs/${runId ?? "0"}/approve`,
    "POST",
    [["fleet-optimizer-run", runId ?? ""], ["fleet-optimizer-runs"]],
    { successMessage: "تمّ التحقّق من الخطة" },
  );
  const rejectMut = useApiMutation<unknown, { reason: string }>(
    `/fleet/optimizer/runs/${runId ?? "0"}/reject`,
    "POST",
    [["fleet-optimizer-run", runId ?? ""], ["fleet-optimizer-runs"]],
    { successMessage: "تمّ رفض الخطة" },
  );

  const run = data?.data;
  const canDecide = run && run.status === "solved";
  const busy = approveMut.isPending || rejectMut.isPending;

  function approve() {
    if (!runId) return;
    approveMut.mutate({});
  }

  function reject() {
    if (!runId || !rejectReason.trim()) return;
    rejectMut.mutate({ reason: rejectReason.trim() }, {
      onSuccess: () => {
        setShowRejectForm(false);
        setRejectReason("");
      },
    });
  }

  if (isLoading || !run) {
    return (
      <PageShell title="تفاصيل عملية التحسين" breadcrumbs={[]}>
        <div className="text-center text-muted-foreground p-12">جارٍ التحميل…</div>
      </PageShell>
    );
  }

  const meta = STATUS_LABELS[run.status] ?? { label: run.status, color: "bg-slate-100" };
  const assignments = run.assignmentsJson ?? [];
  const unassigned = run.unassignedJson ?? [];

  return (
    <PageShell
      title={`عملية تحسين #${run.id}`}
      subtitle={`خوارزمية: ${run.algorithm ?? "—"} · تاريخ التشغيل: ${run.runDate}`}
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/optimizer/runs", label: "مُحسِّن الإسناد" },
        { label: `#${run.id}` },
      ]}
    >
      {/* Header summary */}
      <Card className="mt-4">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">الحالة</div>
            <div className="mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs ${meta.color}`}>{meta.label}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">إسنادات مقترحة</div>
            <div className="text-xl font-bold mt-1">{assignments.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">غير مسنَدة</div>
            <div className="text-xl font-bold mt-1 text-rose-600">{unassigned.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">إجمالي المسافة</div>
            <div className="text-xl font-bold mt-1">
              {run.totalDistanceMeters != null
                ? `${(run.totalDistanceMeters / 1000).toFixed(1)} كم`
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">زمن الحلّ</div>
            <div className="text-xl font-bold mt-1">
              {run.solveDurationMs != null ? `${run.solveDurationMs} مللي` : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {run.errorMessage && (
        <Card className="mt-4 border-rose-300 bg-rose-50">
          <CardContent className="p-4 text-sm">
            <div className="font-medium text-rose-700">فشل الحلّ:</div>
            <div className="text-rose-700 mt-1 font-mono text-xs">{run.errorMessage}</div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {canDecide && (
        <Card className="mt-4">
          <CardContent className="p-4 flex flex-wrap gap-2">
            <Button onClick={approve} disabled={busy}>
              <CheckCircle2 className="h-4 w-4 me-1" />
              الموافقة + التحقّق
            </Button>
            <Button variant="outline" onClick={() => setShowRejectForm((s) => !s)} disabled={busy}>
              <XCircle className="h-4 w-4 me-1" />
              رفض
            </Button>
          </CardContent>
          {showRejectForm && (
            <CardContent className="p-4 border-t space-y-2">
              <label className="text-sm font-medium">سبب الرفض</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="مثال: المركبات المختارة لا تناسب أنواع الحجوزات في هذه الخطة"
                rows={3}
              />
              <Button onClick={reject} disabled={busy || !rejectReason.trim()}>
                تأكيد الرفض
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Assignments table */}
      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="bg-muted/30 px-4 py-2 text-sm font-medium">الإسنادات المقترحة</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-xs">
                <tr>
                  <th className="text-start p-2">#</th>
                  <th className="text-start p-2">سطر الحجز</th>
                  <th className="text-start p-2">المركبة</th>
                  <th className="text-start p-2">السائق</th>
                  <th className="text-end p-2">المسافة (كم)</th>
                  <th className="text-start p-2">السبب</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      لا توجد إسنادات مقترحة في هذه الخطة.
                    </td>
                  </tr>
                )}
                {assignments.map((a) => (
                  <tr key={`${a.sequenceOrder}-${a.bookingLineId}`} className="border-t hover:bg-muted/20">
                    <td className="p-2 font-mono text-xs">{a.sequenceOrder + 1}</td>
                    <td className="p-2 font-mono">#{a.bookingLineId}</td>
                    <td className="p-2 font-mono">#{a.vehicleId}</td>
                    <td className="p-2 font-mono">{a.driverId != null ? `#${a.driverId}` : "—"}</td>
                    <td className="p-2 text-end font-mono">{(a.distanceMeters / 1000).toFixed(2)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {unassigned.length > 0 && (
        <Card className="mt-4 border-rose-300 bg-rose-50">
          <CardContent className="p-4 text-sm">
            <div className="font-medium text-rose-700 mb-2">سطور لم تُسنَد:</div>
            <div className="font-mono text-xs text-rose-700">
              {unassigned.map((id) => `#${id}`).join("، ")}
            </div>
            <div className="text-xs text-rose-700/70 mt-2">
              يحتاج المشغّل إلى توسيع قائمة المركبات أو معالجة أهلية المركبات الموجودة، ثم تشغيل run جديد.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/fleet/optimizer/runs">
            <ArrowRight className="h-3.5 w-3.5 me-1" />
            العودة إلى القائمة
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
