import { useEffect } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormContext } from "react-hook-form";
import {
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { usePermission } from "@/components/shared/permission-gate";

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

const policySchema = z.object({
  lateThresholdMinutes: z.string().optional(),
  gpsRadiusMeters: z.string().optional(),
  penaltyLevel1: z.string().optional(),
  penaltyLevel2: z.string().optional(),
  penaltyLevel3: z.string().optional(),
  penaltyLevel4: z.string().optional(),
  penaltyLevel5: z.string().optional(),
  penaltyLevel1Label: z.string().optional(),
  penaltyLevel2Label: z.string().optional(),
  penaltyLevel3Label: z.string().optional(),
  penaltyLevel4Label: z.string().optional(),
  penaltyLevel5Label: z.string().optional(),
});
type PolicyForm = z.infer<typeof policySchema>;

const num = (v: number | undefined) => (v === undefined || v === null ? "" : String(v));

function HydrateFromServer({ policy }: { policy?: AttendancePolicy }) {
  const { reset } = useFormContext();
  useEffect(() => {
    if (policy) {
      reset({
        lateThresholdMinutes: num(policy.lateThresholdMinutes),
        gpsRadiusMeters: num(policy.gpsRadiusMeters),
        penaltyLevel1: num(policy.penaltyLevel1),
        penaltyLevel2: num(policy.penaltyLevel2),
        penaltyLevel3: num(policy.penaltyLevel3),
        penaltyLevel4: num(policy.penaltyLevel4),
        penaltyLevel5: num(policy.penaltyLevel5),
        penaltyLevel1Label: policy.penaltyLevel1Label ?? "",
        penaltyLevel2Label: policy.penaltyLevel2Label ?? "",
        penaltyLevel3Label: policy.penaltyLevel3Label ?? "",
        penaltyLevel4Label: policy.penaltyLevel4Label ?? "",
        penaltyLevel5Label: policy.penaltyLevel5Label ?? "",
      });
    }
  }, [policy, reset]);
  return null;
}

export default function AttendancePolicyPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<AttendancePolicy>(
    ["hr-attendance-policy"],
    "/hr/attendance-policy",
  );
  const saveMut = useApiMutation<unknown, AttendancePolicy>(
    "/hr/attendance-policy",
    "PUT",
    [["hr-attendance-policy"]],
    { successMessage: "تم حفظ سياسة الحضور", onSuccess: () => refetch() },
  );
  const canUpdate = usePermission("hr.attendance:update");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="سياسة الحضور"
      subtitle="عتبات التأخّر ونصف القطر الجغرافي + سُلَّم الجزاءات الخمسة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "سياسة الحضور" }]}
    >
      <FormShell
        schema={policySchema}
        defaultValues={{
          lateThresholdMinutes: num(data?.lateThresholdMinutes),
          gpsRadiusMeters: num(data?.gpsRadiusMeters),
          penaltyLevel1: num(data?.penaltyLevel1),
          penaltyLevel2: num(data?.penaltyLevel2),
          penaltyLevel3: num(data?.penaltyLevel3),
          penaltyLevel4: num(data?.penaltyLevel4),
          penaltyLevel5: num(data?.penaltyLevel5),
          penaltyLevel1Label: data?.penaltyLevel1Label ?? "",
          penaltyLevel2Label: data?.penaltyLevel2Label ?? "",
          penaltyLevel3Label: data?.penaltyLevel3Label ?? "",
          penaltyLevel4Label: data?.penaltyLevel4Label ?? "",
          penaltyLevel5Label: data?.penaltyLevel5Label ?? "",
        }}
        submitLabel={saveMut.isPending ? "جاري الحفظ..." : "حفظ السياسة"}
        disabled={!canUpdate}
        onSubmit={async (values: PolicyForm) => {
          const numOrUndef = (v?: string) => (v === undefined || v === "" ? undefined : Number(v));
          await saveMut.mutateAsync({
            lateThresholdMinutes: numOrUndef(values.lateThresholdMinutes),
            gpsRadiusMeters: numOrUndef(values.gpsRadiusMeters),
            penaltyLevel1: numOrUndef(values.penaltyLevel1),
            penaltyLevel2: numOrUndef(values.penaltyLevel2),
            penaltyLevel3: numOrUndef(values.penaltyLevel3),
            penaltyLevel4: numOrUndef(values.penaltyLevel4),
            penaltyLevel5: numOrUndef(values.penaltyLevel5),
            penaltyLevel1Label: values.penaltyLevel1Label || undefined,
            penaltyLevel2Label: values.penaltyLevel2Label || undefined,
            penaltyLevel3Label: values.penaltyLevel3Label || undefined,
            penaltyLevel4Label: values.penaltyLevel4Label || undefined,
            penaltyLevel5Label: values.penaltyLevel5Label || undefined,
          });
        }}
      >
        <HydrateFromServer policy={data} />
        <Card>
          <CardHeader><CardTitle className="text-base">عتبات أساسية</CardTitle></CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormNumberField name="lateThresholdMinutes" label="حدّ التأخّر (دقائق)" min="0" />
              <FormNumberField name="gpsRadiusMeters" label="نصف قطر GPS (متر)" min="0" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">سُلَّم الجزاءات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {([1, 2, 3, 4, 5] as const).map((lvl) => (
                <div key={lvl} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="text-sm font-medium">المستوى {lvl}</div>
                  <FormNumberField name={`penaltyLevel${lvl}`} label="المبلغ" min="0" />
                  <FormTextField name={`penaltyLevel${lvl}Label`} label="الوصف" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </PageShell>
  );
}
