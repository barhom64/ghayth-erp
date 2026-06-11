import { useEffect, useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Save, Users, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
/**
 * HR-010 — Attendance policy editor. Single row per company; reads from
 * GET /hr/attendance-policy (returns the row OR sensible defaults), writes
 * back with PUT. The backend upserts on companyId.
 */
interface AttendancePolicy {
  lateThresholdMinutes?: number;
  gpsRadiusMeters?: number;
  penaltyLevel1?: number;
  penaltyLevel2?: number;
  penaltyLevel3?: number;
  penaltyLevel4?: number;
  penaltyLevel5?: number;
  penaltyLevel1Label?: string;
  penaltyLevel2Label?: string;
  penaltyLevel3Label?: string;
  penaltyLevel4Label?: string;
  penaltyLevel5Label?: string;
}

const EMPTY: AttendancePolicy = {};

export default function AttendancePolicyPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<AttendancePolicy>(
    ["hr-attendance-policy"],
    "/hr/attendance-policy",
  );
  const [form, setForm] = useState<AttendancePolicy>(EMPTY);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMut = useApiMutation<unknown, AttendancePolicy>(
    "/hr/attendance-policy",
    "PUT",
    [["hr-attendance-policy"]],
    { successMessage: "تم حفظ سياسة الحضور", onSuccess: () => refetch() },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const num = (v: number | undefined) => (v === undefined || v === null ? "" : String(v));
  const setNum = (k: keyof AttendancePolicy) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v === "" ? undefined : Number(v) }));
  };
  const setStr = (k: keyof AttendancePolicy) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const handleSave = () => {
    saveMut.mutate(form);
  };

  return (
    <PageShell
      title="سياسة الحضور"
      subtitle="عتبات التأخّر ونصف القطر الجغرافي + سُلَّم الجزاءات الخمسة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "سياسة الحضور" }]}
      actions={
        <PrintButton
          entityType="report_hr_attendance_policy"
          entityId="list"
          size="icon"
          payload={{
            entity: { title: "سياسة الحضور", total: 5 },
            items: [
              { "البند": "حدّ التأخّر (دقائق)", "القيمة": form.lateThresholdMinutes ?? "—" },
              { "البند": "نصف قطر GPS (متر)", "القيمة": form.gpsRadiusMeters ?? "—" },
              ...([1, 2, 3, 4, 5] as const).map((lvl) => ({
                "البند": `المستوى ${lvl}: ${form[`penaltyLevel${lvl}Label` as const] ?? ""}`,
                "القيمة": form[`penaltyLevel${lvl}` as const] ?? "—",
              })),
            ],
          }}
        />
      }
    >
      <HrTabsNav />
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">عتبات أساسية</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>حدّ التأخّر (دقائق)</Label>
                <Input type="number" min={0} dir="ltr" value={num(form.lateThresholdMinutes)} onChange={setNum("lateThresholdMinutes")} className="mt-1" />
              </div>
              <div>
                <Label>نصف قطر GPS (متر)</Label>
                <Input type="number" min={0} dir="ltr" value={num(form.gpsRadiusMeters)} onChange={setNum("gpsRadiusMeters")} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">سُلَّم الجزاءات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {([1, 2, 3, 4, 5] as const).map((lvl) => {
                const amountKey = `penaltyLevel${lvl}` as const;
                const labelKey = `penaltyLevel${lvl}Label` as const;
                return (
                  <div key={lvl} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="text-sm font-medium">المستوى {lvl}</div>
                    <div>
                      <Label className="text-xs">المبلغ</Label>
                      <Input type="number" min={0} dir="ltr" value={num(form[amountKey])} onChange={setNum(amountKey)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">الوصف</Label>
                      <Input value={form[labelKey] ?? ""} onChange={setStr(labelKey)} className="mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* PR-3 (#2077) — discoverability hint for the per-category page.
            Each employee carries a `categoryKey` (set on the wizard,
            mandatory since PR-1); the override page lets HR adjust the
            policy per category (driver vs office vs manager) instead
            of fighting the company-wide defaults. The link uses the
            new /hr route added in PR-3. */}
        <Card className="border-dashed border-status-info-surface bg-status-info-surface/30">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Users className="h-5 w-5 text-status-info-foreground shrink-0" />
            <div className="flex-1">
              <p className="font-medium">هل تحتاج سياسة مختلفة لفئة معيّنة؟</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                الإعدادات أعلاه هي سياسة الشركة الافتراضية. يمكنك تجاوزها لكل فئة موظفين (سائق، ميداني، مكتبي، …) من صفحة overrides المخصصة.
              </p>
            </div>
            <Link href="/hr/attendance-categories">
              <a className="inline-flex items-center gap-1 text-status-info-foreground hover:underline text-sm whitespace-nowrap">
                إدارة الـoverrides
                <ArrowLeft className="h-3.5 w-3.5" />
              </a>
            </Link>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <GuardedButton perm="hr.attendance:update" onClick={handleSave} disabled={saveMut.isPending} rateLimitAware>
            <Save className="h-4 w-4 ml-1" /> {saveMut.isPending ? "جاري الحفظ..." : "حفظ السياسة"}
          </GuardedButton>
        </div>
      </div>
    </PageShell>
  );
}
