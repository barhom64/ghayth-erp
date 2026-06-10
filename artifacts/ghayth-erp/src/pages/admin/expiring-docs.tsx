import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Link } from "wouter";
import { formatNumber } from "@/lib/formatters";
import { Stamp, Car, AlertTriangle, RefreshCw, IdCard, Calendar } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";

interface ExpiringEmployee {
  id: number;
  name: string;
  empNumber: string | null;
  iqamaNumber: string | null;
  iqamaExpiry: string | null;
  visaNumber: string | null;
  visaType: string | null;
  visaExpiry: string | null;
  workPermitNumber: string | null;
  workPermitExpiry: string | null;
  iqamaStatus: string | null;
  iqamaDaysLeft: number | null;
  visaDaysLeft: number | null;
  workPermitDaysLeft: number | null;
  jobTitle: string | null;
  branchId: number | null;
  branchName: string | null;
}

interface ExpiringVehicle {
  id: number;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  registrationNumber: string | null;
  registrationExpiry: string | null;
  inspectionDate: string | null;
  nextInspectionDate: string | null;
  plateType: string | null;
  registrationDaysLeft: number | null;
  inspectionDaysLeft: number | null;
}

const colorForDays = (days: number | null): string => {
  if (days == null) return "";
  if (days <= 7) return "text-red-700 font-bold";
  if (days <= 14) return "text-orange-700 font-semibold";
  if (days <= 30) return "text-amber-700";
  return "text-emerald-700";
};

export default function ExpiringDocsPage() {
  const [days, setDays] = useState<number>(30);

  const { data: empResp, isLoading: empLoading, isError: empError, refetch: refetchEmp, isFetching: empFetching } =
    useApiQuery<{ data: ExpiringEmployee[] }>(
      ["expiring-iqama", String(days)],
      `/gov-integrations/expiring/iqama?days=${days}`,
    );

  const { data: vehResp, isLoading: vehLoading, isError: vehError, refetch: refetchVeh, isFetching: vehFetching } =
    useApiQuery<{ data: ExpiringVehicle[] }>(
      ["expiring-registration", String(days)],
      `/gov-integrations/expiring/registration?days=${days}`,
    );

  if (empLoading || vehLoading) return <LoadingSpinner />;
  if (empError || vehError) return <ErrorState />;

  const employees = empResp?.data ?? [];
  const vehicles = vehResp?.data ?? [];

  const empCritical = employees.filter((e) => {
    const min = Math.min(...[e.iqamaDaysLeft, e.visaDaysLeft, e.workPermitDaysLeft].filter((d): d is number => d != null));
    return Number.isFinite(min) && min <= 7;
  }).length;
  const vehCritical = vehicles.filter((v) => {
    const min = Math.min(...[v.registrationDaysLeft, v.inspectionDaysLeft].filter((d): d is number => d != null));
    return Number.isFinite(min) && min <= 7;
  }).length;

  const empCols: DataTableColumn<ExpiringEmployee>[] = [
    {
      key: "name",
      header: "الموظف",
      render: (e) => (
        <Link href={`/employees/${e.id}`} className="text-status-info-foreground hover:underline">
          <div className="flex flex-col">
            <span className="text-xs font-medium">{e.name}</span>
            {e.empNumber && <span className="text-[10px] text-muted-foreground">#{e.empNumber}</span>}
          </div>
        </Link>
      ),
    },
    {
      key: "jobTitle",
      header: "المسمى",
      render: (e) => (
        <div className="flex flex-col">
          <span className="text-xs">{e.jobTitle ?? "—"}</span>
          {e.branchName && <span className="text-[10px] text-muted-foreground">{e.branchName}</span>}
        </div>
      ),
    },
    {
      key: "iqama",
      header: "الإقامة",
      render: (e) => (
        <div className="flex flex-col">
          {e.iqamaNumber && <span className="font-mono text-[10px]">{e.iqamaNumber}</span>}
          {e.iqamaExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.iqamaDaysLeft)}`}>
                {new Date(e.iqamaExpiry).toLocaleDateString("ar-SA")}
                {e.iqamaDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.iqamaDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "visa",
      header: "التأشيرة",
      render: (e) => (
        <div className="flex flex-col">
          {e.visaNumber && <span className="font-mono text-[10px]">{e.visaNumber}</span>}
          {e.visaExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.visaDaysLeft)}`}>
                {new Date(e.visaExpiry).toLocaleDateString("ar-SA")}
                {e.visaDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.visaDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "workPermit",
      header: "رخصة العمل",
      render: (e) => (
        <div className="flex flex-col">
          {e.workPermitNumber && <span className="font-mono text-[10px]">{e.workPermitNumber}</span>}
          {e.workPermitExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.workPermitDaysLeft)}`}>
                {new Date(e.workPermitExpiry).toLocaleDateString("ar-SA")}
                {e.workPermitDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.workPermitDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
  ];

  const vehCols: DataTableColumn<ExpiringVehicle>[] = [
    {
      key: "plate",
      header: "اللوحة + المركبة",
      render: (v) => (
        <Link href={`/fleet/vehicles/${v.id}`} className="text-status-info-foreground hover:underline">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-medium">{v.plateNumber ?? `#${v.id}`}</span>
            <span className="text-[10px] text-muted-foreground">
              {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </span>
          </div>
        </Link>
      ),
    },
    {
      key: "plateType",
      header: "نوع اللوحة",
      render: (v) => v.plateType
        ? <Badge variant="outline" className="text-[10px]">{v.plateType}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "registration",
      header: "الاستمارة",
      render: (v) => (
        <div className="flex flex-col">
          {v.registrationNumber && <span className="font-mono text-[10px]">{v.registrationNumber}</span>}
          {v.registrationExpiry
            ? (
              <span className={`text-xs ${colorForDays(v.registrationDaysLeft)}`}>
                {new Date(v.registrationExpiry).toLocaleDateString("ar-SA")}
                {v.registrationDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({v.registrationDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "inspection",
      header: "الفحص الدوري",
      render: (v) => (
        <div className="flex flex-col">
          {v.inspectionDate && <span className="text-[10px] text-muted-foreground">آخر فحص: {new Date(v.inspectionDate).toLocaleDateString("ar-SA")}</span>}
          {v.nextInspectionDate
            ? (
              <span className={`text-xs ${colorForDays(v.inspectionDaysLeft)}`}>
                التالي: {new Date(v.nextInspectionDate).toLocaleDateString("ar-SA")}
                {v.inspectionDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({v.inspectionDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="المستندات الحكومية القاربة على الانتهاء"
      subtitle="إقامات / تأشيرات / رخص عمل / استمارات سيارات / فحوصات دورية — كل ما يقارب الانتهاء خلال X يوم"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "مستندات قاربت الانتهاء" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_expiring_docs"
            entityId="list"
            size="icon"
            label="طباعة المستندات القاربة على الانتهاء"
            payload={() => ({
              entity: {
                title: `المستندات القاربة على الانتهاء — خلال ${days} يوم`,
                days,
                employeesCount: employees.length,
                vehiclesCount: vehicles.length,
                empCritical,
                vehCritical,
              },
              sections: [
                {
                  title: "وثائق الموظفين",
                  rows: employees.map((e: any) => ({
                    "اسم الموظف": e.name || "—",
                    "الرقم الوظيفي": e.empNumber || "—",
                    "إقامة (أيام متبقية)": e.iqamaDaysLeft ?? "—",
                    "تأشيرة (أيام)": e.visaDaysLeft ?? "—",
                    "رخصة عمل (أيام)": e.workPermitDaysLeft ?? "—",
                  })),
                },
                {
                  title: "وثائق المركبات",
                  rows: vehicles.map((v: any) => ({
                    "اللوحة": v.plateNumber || "—",
                    "المركبة": [v.make, v.model].filter(Boolean).join(" ") || "—",
                    "استمارة (أيام متبقية)": v.registrationDaysLeft ?? "—",
                    "فحص دوري (أيام)": v.inspectionDaysLeft ?? "—",
                  })),
                },
              ],
            })}
          />
          <Label className="text-xs whitespace-nowrap">خلال:</Label>
          <Input type="number" min={1} max={365} value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
            className="h-8 w-20 text-xs font-mono" />
          <span className="text-xs text-muted-foreground">يوم</span>
          <Button variant="outline" size="sm"
            onClick={() => { refetchEmp(); refetchVeh(); }}
            disabled={empFetching || vehFetching}>
            <RefreshCw className={`h-4 w-4 me-1 ${(empFetching || vehFetching) ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      }
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> لماذا هذه الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            انتهاء الإقامة أو الفحص الدوري بدون تجديد يعرّض الشركة لغرامات
            مرور / مكتب عمل / جوازات. هذي الصفحة تجمع كل ما يقترب من
            الانتهاء خلال نافذة قابلة للضبط — لتجديده <strong>قبل</strong> الانتهاء.
            الألوان: ≤7 أيام أحمر / ≤14 برتقالي / ≤30 كهرماني.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Stamp className="h-3 w-3" /> وثائق موظفين
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(employees.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حرج (≤7 يوم) موظفين</p>
            <p className="text-lg font-bold font-mono text-red-700">{formatNumber(empCritical)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Car className="h-3 w-3" /> وثائق مركبات
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(vehicles.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حرج (≤7 يوم) مركبات</p>
            <p className="text-lg font-bold font-mono text-red-700">{formatNumber(vehCritical)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="text-xs">
            <IdCard className="h-3.5 w-3.5 me-1" /> الموظفون ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="text-xs">
            <Car className="h-3.5 w-3.5 me-1" /> المركبات ({vehicles.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" /> الموظفون
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={empCols} data={employees}
                pageSize={50}
                emptyMessage={`ما في موظف بإقامة/تأشيرة/رخصة تنتهي خلال ${days} يوم 🎉`}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="vehicles">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" /> المركبات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={vehCols} data={vehicles}
                pageSize={50}
                emptyMessage={`ما في مركبة باستمارة/فحص ينتهي خلال ${days} يوم 🎉`}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Link } from "wouter";
import { formatNumber } from "@/lib/formatters";
import { Stamp, Car, AlertTriangle, RefreshCw, IdCard, Calendar } from "lucide-react";

interface ExpiringEmployee {
  id: number;
  name: string;
  empNumber: string | null;
  iqamaNumber: string | null;
  iqamaExpiry: string | null;
  visaNumber: string | null;
  visaType: string | null;
  visaExpiry: string | null;
  workPermitNumber: string | null;
  workPermitExpiry: string | null;
  iqamaStatus: string | null;
  iqamaDaysLeft: number | null;
  visaDaysLeft: number | null;
  workPermitDaysLeft: number | null;
  jobTitle: string | null;
  branchId: number | null;
  branchName: string | null;
}

interface ExpiringVehicle {
  id: number;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  registrationNumber: string | null;
  registrationExpiry: string | null;
  inspectionDate: string | null;
  nextInspectionDate: string | null;
  plateType: string | null;
  registrationDaysLeft: number | null;
  inspectionDaysLeft: number | null;
}

const colorForDays = (days: number | null): string => {
  if (days == null) return "";
  if (days <= 7) return "text-red-700 font-bold";
  if (days <= 14) return "text-orange-700 font-semibold";
  if (days <= 30) return "text-amber-700";
  return "text-emerald-700";
};

export default function ExpiringDocsPage() {
  const [days, setDays] = useState<number>(30);

  const { data: empResp, isLoading: empLoading, isError: empError, refetch: refetchEmp, isFetching: empFetching } =
    useApiQuery<{ data: ExpiringEmployee[] }>(
      ["expiring-iqama", String(days)],
      `/gov-integrations/expiring/iqama?days=${days}`,
    );

  const { data: vehResp, isLoading: vehLoading, isError: vehError, refetch: refetchVeh, isFetching: vehFetching } =
    useApiQuery<{ data: ExpiringVehicle[] }>(
      ["expiring-registration", String(days)],
      `/gov-integrations/expiring/registration?days=${days}`,
    );

  if (empLoading || vehLoading) return <LoadingSpinner />;
  if (empError || vehError) return <ErrorState />;

  const employees = empResp?.data ?? [];
  const vehicles = vehResp?.data ?? [];

  const empCritical = employees.filter((e) => {
    const min = Math.min(...[e.iqamaDaysLeft, e.visaDaysLeft, e.workPermitDaysLeft].filter((d): d is number => d != null));
    return Number.isFinite(min) && min <= 7;
  }).length;
  const vehCritical = vehicles.filter((v) => {
    const min = Math.min(...[v.registrationDaysLeft, v.inspectionDaysLeft].filter((d): d is number => d != null));
    return Number.isFinite(min) && min <= 7;
  }).length;

  const empCols: DataTableColumn<ExpiringEmployee>[] = [
    {
      key: "name",
      header: "الموظف",
      render: (e) => (
        <Link href={`/employees/${e.id}`} className="text-status-info-foreground hover:underline">
          <div className="flex flex-col">
            <span className="text-xs font-medium">{e.name}</span>
            {e.empNumber && <span className="text-[10px] text-muted-foreground">#{e.empNumber}</span>}
          </div>
        </Link>
      ),
    },
    {
      key: "jobTitle",
      header: "المسمى",
      render: (e) => (
        <div className="flex flex-col">
          <span className="text-xs">{e.jobTitle ?? "—"}</span>
          {e.branchName && <span className="text-[10px] text-muted-foreground">{e.branchName}</span>}
        </div>
      ),
    },
    {
      key: "iqama",
      header: "الإقامة",
      render: (e) => (
        <div className="flex flex-col">
          {e.iqamaNumber && <span className="font-mono text-[10px]">{e.iqamaNumber}</span>}
          {e.iqamaExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.iqamaDaysLeft)}`}>
                {new Date(e.iqamaExpiry).toLocaleDateString("ar-SA")}
                {e.iqamaDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.iqamaDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "visa",
      header: "التأشيرة",
      render: (e) => (
        <div className="flex flex-col">
          {e.visaNumber && <span className="font-mono text-[10px]">{e.visaNumber}</span>}
          {e.visaExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.visaDaysLeft)}`}>
                {new Date(e.visaExpiry).toLocaleDateString("ar-SA")}
                {e.visaDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.visaDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "workPermit",
      header: "رخصة العمل",
      render: (e) => (
        <div className="flex flex-col">
          {e.workPermitNumber && <span className="font-mono text-[10px]">{e.workPermitNumber}</span>}
          {e.workPermitExpiry
            ? (
              <span className={`text-xs ${colorForDays(e.workPermitDaysLeft)}`}>
                {new Date(e.workPermitExpiry).toLocaleDateString("ar-SA")}
                {e.workPermitDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({e.workPermitDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
  ];

  const vehCols: DataTableColumn<ExpiringVehicle>[] = [
    {
      key: "plate",
      header: "اللوحة + المركبة",
      render: (v) => (
        <Link href={`/fleet/vehicles/${v.id}`} className="text-status-info-foreground hover:underline">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-medium">{v.plateNumber ?? `#${v.id}`}</span>
            <span className="text-[10px] text-muted-foreground">
              {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            </span>
          </div>
        </Link>
      ),
    },
    {
      key: "plateType",
      header: "نوع اللوحة",
      render: (v) => v.plateType
        ? <Badge variant="outline" className="text-[10px]">{v.plateType}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "registration",
      header: "الاستمارة",
      render: (v) => (
        <div className="flex flex-col">
          {v.registrationNumber && <span className="font-mono text-[10px]">{v.registrationNumber}</span>}
          {v.registrationExpiry
            ? (
              <span className={`text-xs ${colorForDays(v.registrationDaysLeft)}`}>
                {new Date(v.registrationExpiry).toLocaleDateString("ar-SA")}
                {v.registrationDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({v.registrationDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
    {
      key: "inspection",
      header: "الفحص الدوري",
      render: (v) => (
        <div className="flex flex-col">
          {v.inspectionDate && <span className="text-[10px] text-muted-foreground">آخر فحص: {new Date(v.inspectionDate).toLocaleDateString("ar-SA")}</span>}
          {v.nextInspectionDate
            ? (
              <span className={`text-xs ${colorForDays(v.inspectionDaysLeft)}`}>
                التالي: {new Date(v.nextInspectionDate).toLocaleDateString("ar-SA")}
                {v.inspectionDaysLeft != null && (
                  <span className="ms-1 text-[10px]">({v.inspectionDaysLeft} يوم)</span>
                )}
              </span>
            )
            : <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="المستندات الحكومية القاربة على الانتهاء"
      subtitle="إقامات / تأشيرات / رخص عمل / استمارات سيارات / فحوصات دورية — كل ما يقارب الانتهاء خلال X يوم"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "مستندات قاربت الانتهاء" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">خلال:</Label>
          <Input type="number" min={1} max={365} value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
            className="h-8 w-20 text-xs font-mono" />
          <span className="text-xs text-muted-foreground">يوم</span>
          <Button variant="outline" size="sm"
            onClick={() => { refetchEmp(); refetchVeh(); }}
            disabled={empFetching || vehFetching}>
            <RefreshCw className={`h-4 w-4 me-1 ${(empFetching || vehFetching) ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      }
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> لماذا هذه الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            انتهاء الإقامة أو الفحص الدوري بدون تجديد يعرّض الشركة لغرامات
            مرور / مكتب عمل / جوازات. هذي الصفحة تجمع كل ما يقترب من
            الانتهاء خلال نافذة قابلة للضبط — لتجديده <strong>قبل</strong> الانتهاء.
            الألوان: ≤7 أيام أحمر / ≤14 برتقالي / ≤30 كهرماني.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Stamp className="h-3 w-3" /> وثائق موظفين
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(employees.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حرج (≤7 يوم) موظفين</p>
            <p className="text-lg font-bold font-mono text-red-700">{formatNumber(empCritical)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Car className="h-3 w-3" /> وثائق مركبات
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(vehicles.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حرج (≤7 يوم) مركبات</p>
            <p className="text-lg font-bold font-mono text-red-700">{formatNumber(vehCritical)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="text-xs">
            <IdCard className="h-3.5 w-3.5 me-1" /> الموظفون ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="text-xs">
            <Car className="h-3.5 w-3.5 me-1" /> المركبات ({vehicles.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" /> الموظفون
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={empCols} data={employees}
                pageSize={50}
                emptyMessage={`ما في موظف بإقامة/تأشيرة/رخصة تنتهي خلال ${days} يوم 🎉`}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="vehicles">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" /> المركبات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={vehCols} data={vehicles}
                pageSize={50}
                emptyMessage={`ما في مركبة باستمارة/فحص ينتهي خلال ${days} يوم 🎉`}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
