import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { UserCheck, Inbox } from "lucide-react";

/**
 * /hr/self-onboarding-review — «طلبات استكمال البيانات».
 *
 * يعرض الموظفين الذين أرسلوا بياناتهم الشخصية عبر رابط الاستكمال الذاتي
 * (activationStatus=self_submitted). يراجع HR ما أدخله الموظف ثم يعتمد
 * (يُطبَّق على السجل، لا حقول صاحب الشركة) أو يرفض (يُعاد للموظف لتصحيحه).
 */

const FIELD_LABELS: Record<string, string> = {
  nationalId: "رقم الهوية", nationality: "الجنسية", gender: "الجنس", dateOfBirth: "تاريخ الميلاد",
  phone: "الجوال", personalEmail: "البريد الشخصي",
  iqamaNumber: "رقم الإقامة", iqamaExpiry: "انتهاء الإقامة",
  passportNumber: "رقم الجواز", passportExpiry: "انتهاء الجواز",
  borderNumber: "رقم الحدود", visaNumber: "رقم التأشيرة", visaType: "نوع التأشيرة", visaExpiry: "انتهاء التأشيرة",
  bankName: "اسم البنك", bankAccount: "الحساب البنكي", iban: "الآيبان",
  emergencyContact: "جهة الطوارئ", emergencyPhone: "رقم الطوارئ",
};

export default function SelfOnboardingReviewPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["employee-self-submissions"], "/employees/self-submissions");
  const [openId, setOpenId] = useState<number | null>(null);

  const approveMut = useApiMutation<unknown, { id: number }>(
    (b) => `/employees/${b.id}/approve-self-data`,
    "POST",
    [["employee-self-submissions"], ["employees"]],
    { successMessage: "اعتُمدت بيانات الموظف" },
  );
  const rejectMut = useApiMutation<unknown, { id: number }>(
    (b) => `/employees/${b.id}/reject-self-data`,
    "POST",
    [["employee-self-submissions"]],
    { successMessage: "أُعيدت البيانات للموظف لتصحيحها" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows: any[] = data?.data ?? [];

  return (
    <PageShell title="طلبات استكمال البيانات" subtitle="مراجعة واعتماد البيانات التي أدخلها الموظفون عبر رابط الاستكمال الذاتي">
      <HrTabsNav />
      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Inbox className="w-10 h-10 mx-auto mb-2 opacity-60" />
          لا توجد طلبات بانتظار المراجعة.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const submitted = (r.selfSubmittedData && typeof r.selfSubmittedData === "object") ? r.selfSubmittedData : {};
            const open = openId === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AvatarInitial name={r.name} />
                      <div>
                        <div className="font-medium">{r.name} <span className="text-xs text-muted-foreground">({r.empNumber})</span></div>
                        <div className="text-xs text-muted-foreground">
                          {r.jobTitle || "—"} · {r.branchName || "—"} · أُرسلت {r.selfSubmittedAt ? formatDateAr(r.selfSubmittedAt) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-sm text-status-info-foreground underline" onClick={() => setOpenId(open ? null : r.id)}>
                        {open ? "إخفاء" : "عرض البيانات"}
                      </button>
                      <GuardedButton
                        perm="hr:update"
                        onClick={() => approveMut.mutate({ id: r.id })}
                        disabled={approveMut.isPending}
                        className="bg-status-success-surface text-status-success-foreground rounded-lg px-4 py-1.5 text-sm"
                      >
                        <UserCheck className="w-4 h-4 inline ml-1" /> اعتماد
                      </GuardedButton>
                      <GuardedButton
                        perm="hr:update"
                        onClick={() => rejectMut.mutate({ id: r.id })}
                        disabled={rejectMut.isPending}
                        className="border border-border rounded-lg px-4 py-1.5 text-sm"
                      >
                        إعادة للتصحيح
                      </GuardedButton>
                    </div>
                  </div>
                  {open && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm border-t border-border pt-3">
                      {Object.keys(FIELD_LABELS).map((k) => (
                        <div key={k}>
                          <span className="text-muted-foreground">{FIELD_LABELS[k]}: </span>
                          {k === "gender"
                            ? (submitted[k] === "female" ? "أنثى" : submitted[k] === "male" ? "ذكر" : "—")
                            : (submitted[k] || "—")}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
