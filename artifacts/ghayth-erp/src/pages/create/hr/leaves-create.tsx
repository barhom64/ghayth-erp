import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormContext, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Autocomplete } from "@/components/ui/autocomplete";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Calendar, Info, Clock, User } from "lucide-react";

const schema = z
  .object({
    leaveTypeId: z.string().min(1, "يرجى اختيار نوع الإجازة"),
    startDate: z.string().min(1, "تاريخ البداية مطلوب"),
    endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
    reason: z.string().optional(),
    reliefOfficer: z.string().optional(),
    contactDuringLeave: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

// Days count + balance warning panel — lives inside FormShell.
function DaysSummary({ balances, leaveTypes }: { balances: any[]; leaveTypes: any[] }) {
  const { watch } = useFormContext();
  const leaveTypeId = watch("leaveTypeId") as string;
  const startDate = watch("startDate") as string;
  const endDate = watch("endDate") as string;
  let daysCount = 0;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end >= start) daysCount = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
  const selectedType = leaveTypes.find((lt: any) => String(lt.id) === leaveTypeId);
  const selectedBalance = balances.find(
    (b: any) => String(b.leaveTypeId) === leaveTypeId || b.name === selectedType?.name,
  );
  const exceedsBalance =
    selectedBalance && daysCount > (selectedBalance.remaining ?? selectedBalance.balance ?? 999);
  if (daysCount === 0) return null;
  return (
    <div className="bg-status-info-surface border border-status-info-surface rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-status-info-foreground" />
          <span className="text-sm font-medium text-status-info-foreground">مدة الإجازة</span>
        </div>
        <Badge className="bg-status-info-surface text-status-info-foreground text-base px-3 py-1">
          {daysCount} {daysCount === 1 ? "يوم" : daysCount === 2 ? "يومان" : daysCount <= 10 ? "أيام" : "يوم"}
        </Badge>
      </div>
      {exceedsBalance && (
        <div className="mt-2 flex items-center gap-2 text-status-warning-foreground text-xs">
          <Info className="w-3.5 h-3.5" />
          <span>
            عدد الأيام المطلوبة يتجاوز رصيدك المتبقي ({selectedBalance.remaining ?? selectedBalance.balance} يوم)
          </span>
        </div>
      )}
    </div>
  );
}

function ReliefOfficerField({ employees }: { employees: any[] }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name="reliefOfficer"
      render={({ field }) => (
        <div className="space-y-1.5">
          <Label htmlFor="reliefOfficer">المكلّف بالعمل أثناء الإجازة</Label>
          <Autocomplete
            value={(field.value as string) ?? ""}
            onChange={(v) => field.onChange(String(v))}
            options={employees.map((e: any) => ({
              value: String(e.id),
              label: e.name,
              subtitle: e.jobTitle || e.departmentName || "",
            }))}
            placeholder="ابحث عن الزميل المكلّف..."
            emptyMessage="لا يوجد موظفين"
          />
          <p className="text-xs text-muted-foreground">من سيتولى المهام أثناء غيابك</p>
        </div>
      )}
    />
  );
}

export default function LeavesCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const copyLeaveType = params.get("copyLeaveType") || "";
  const copyReason = params.get("copyReason") || "";
  const { user } = useAuth();
  const createMut = useApiMutation(
    "/hr/leave-requests",
    "POST",
    [["leave-requests"], ["leaves"], ["leave-balance"]],
    { successMessage: "تم إرسال طلب الإجازة بنجاح" },
  );
  const leaveTypesQ = useApiQuery<any>(["leave-types"], "/hr/leave-types");
  const leaveTypes = asList<any>(leaveTypesQ.data);
  const balanceQ = useApiQuery<any>(["leave-balance"], "/hr/leave-balance");
  const balances = balanceQ.data?.data || balanceQ.data?.balances || [];
  const { data: empData, isLoading: loadingEmp, isError: errorEmp } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const employees = empData?.data || [];
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (leaveTypesQ.isLoading || loadingEmp) return <LoadingSpinner />;
  if (leaveTypesQ.isError || errorEmp) return <ErrorState />;

  const leaveTypeOptions = leaveTypes.map((lt: any) => ({ value: String(lt.id), label: lt.name }));

  return (
    <CreatePageLayout title="طلب إجازة جديد" backPath="/hr/leaves">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
      </div>

      {balances.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> رصيد الإجازات
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {balances.slice(0, 4).map((b: any) => (
              <Card key={b.id || b.type} className="border-border">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{b.name || b.typeName || b.type || "إجازة"}</p>
                  <p className="text-xl font-bold mt-1">{b.remaining ?? b.balance ?? 0}</p>
                  <p className="text-2xs text-muted-foreground">من {b.annualDays ?? b.total ?? b.entitled ?? 0} يوم</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3">تفاصيل الإجازة</h3>
      <FormShell
        schema={schema}
        defaultValues={{
          leaveTypeId: copyLeaveType,
          startDate: "",
          endDate: "",
          reason: copyReason,
          reliefOfficer: "",
          contactDuringLeave: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/leaves")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                leaveTypeId: Number(values.leaveTypeId),
                startDate: values.startDate,
                endDate: values.endDate,
                reason: values.reason,
                reliefOfficer: values.reliefOfficer || undefined,
                contactDuringLeave: values.contactDuringLeave || undefined,
                documentUrl: attachments.length > 0 ? attachments[0].dataUrl : undefined,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/leaves");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField name="leaveTypeId" label="نوع الإجازة" required placeholder="اختر النوع" options={leaveTypeOptions} />
          <FormTextareaField name="reason" label="السبب" placeholder="سبب طلب الإجازة..." />
          <FormDateField name="startDate" label="من تاريخ" required />
          <FormDateField name="endDate" label="إلى تاريخ" required />
        </FormGrid>
        <DaysSummary balances={balances} leaveTypes={leaveTypes} />
        <h3 className="text-sm font-semibold text-status-neutral-foreground flex items-center gap-2 mt-2">
          <User className="w-4 h-4" /> معلومات إضافية
        </h3>
        <FormGrid cols={2}>
          <ReliefOfficerField employees={employees} />
          <FormTextField name="contactDuringLeave" label="رقم التواصل أثناء الإجازة" placeholder="05xxxxxxxx" description="للتواصل في حالات الطوارئ" />
        </FormGrid>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات (تقرير طبي، إلخ)" />
      </FormShell>
    </CreatePageLayout>
  );
}
