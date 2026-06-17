import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Users, FileText, Briefcase, Layers, ExternalLink, AlertCircle,
} from "lucide-react";

// #1812 source-context display (user's operational review).
// Renders an at-a-glance summary of the upstream entity that
// originated this booking — so the operator doesn't need to click
// through to the umrah / CRM / contracts / projects module to see
// the related context.
//
// Backend (transport-bookings.ts → loadSourceContext) returns the
// sourceContext payload only when the booking has a real upstream
// link (i.e. bookingSource != 'manual_entry' + the FK resolves).
// When sourceContext is null, this component renders nothing.

interface UmrahGroupEntity {
  id: number;
  name: string | null;
  groupNumber: string | null;
  mutamerCount: number | null;
  programDuration: number | null;
  arrivalDate: string | null;
  departureDate: string | null;
  umrahSupervisor: string | null;
}

interface CustomerEntity {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  customerType: string | null;
}

interface ContractEntity {
  id: number;
  contractNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
}

interface ProjectEntity {
  id: number;
  name: string | null;
  code: string | null;
  status: string | null;
}

type SourceEntity = UmrahGroupEntity | CustomerEntity | ContractEntity | ProjectEntity;

interface SourceContext {
  source: string;
  entity: SourceEntity;
}

interface Props {
  sourceContext: SourceContext | null;
}

const SOURCE_BADGE: Record<string, { label: string; color: string; icon: typeof Users }> = {
  umrah_group:        { label: "مصدر: مجموعة عمرة",  color: "bg-emerald-100 text-emerald-700",     icon: Users },
  customer_request:   { label: "مصدر: طلب عميل",     color: "bg-blue-100 text-blue-700",            icon: FileText },
  contract_schedule:  { label: "مصدر: جدول عقد",     color: "bg-purple-100 text-purple-700",        icon: Briefcase },
  recurring_schedule: { label: "مصدر: جدول متكرر",  color: "bg-amber-100 text-amber-700",          icon: Layers },
  import_excel:       { label: "مصدر: استيراد",      color: "bg-slate-100 text-slate-700",          icon: FileText },
  api_integration:    { label: "مصدر: تكامل API",     color: "bg-indigo-100 text-indigo-700",        icon: FileText },
};

const fmtDate = (s: string | null): string => s ? new Date(s).toLocaleDateString("ar") : "—";

export function BookingSourceContextPanel({ sourceContext }: Props) {
  if (!sourceContext || !sourceContext.entity) return null;

  const meta = SOURCE_BADGE[sourceContext.source] ?? {
    label: `مصدر: ${sourceContext.source}`,
    color: "bg-slate-100 text-slate-700",
    icon: AlertCircle,
  };
  const Icon = meta.icon;
  const { source, entity } = sourceContext;

  return (
    <Card className="border-2 border-status-info-foreground/40 bg-status-info-surface/15 mb-3">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-status-info-foreground" />
            <Badge className={meta.color}>{meta.label}</Badge>
          </div>
          {/* Deep-link to the source module so operator can drill down. */}
          {source === "umrah_group" && (
            <Link href={`/umrah/groups/${entity.id}`} asChild>
              <a className="text-xs text-status-info-foreground hover:underline flex items-center gap-1">
                فتح المجموعة <ExternalLink className="h-3 w-3" />
              </a>
            </Link>
          )}
          {(source === "customer_request" || source === "contract_schedule") && (
            <Link href={`/clients/${(entity as CustomerEntity).id}`} asChild>
              <a className="text-xs text-status-info-foreground hover:underline flex items-center gap-1">
                فتح ملف العميل <ExternalLink className="h-3 w-3" />
              </a>
            </Link>
          )}
        </div>

        {source === "umrah_group" && (() => {
          const g = entity as UmrahGroupEntity;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">رقم النسك</div>
                <div className="font-mono">{g.groupNumber || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">عدد المعتمرين</div>
                <div className="font-mono">{g.mutamerCount ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">مدة البرنامج</div>
                <div>{g.programDuration ? `${g.programDuration} يوم` : "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">مشرف المجموعة</div>
                <div>{g.umrahSupervisor || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">تاريخ الوصول</div>
                <div>{fmtDate(g.arrivalDate)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">تاريخ المغادرة</div>
                <div>{fmtDate(g.departureDate)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">اسم المجموعة</div>
                <div className="font-medium">{g.name || "—"}</div>
              </div>
            </div>
          );
        })()}

        {(source === "customer_request" || source === "contract_schedule") &&
          (entity as CustomerEntity).name != null && (() => {
            const c = entity as CustomerEntity;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="col-span-2">
                  <div className="text-muted-foreground">العميل</div>
                  <div className="font-medium">{c.name || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">الهاتف</div>
                  <div className="font-mono" dir="ltr">{c.phone || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">النوع</div>
                  <div>{c.customerType || "—"}</div>
                </div>
              </div>
            );
          })()}

        {source === "contract_schedule" && "contractNumber" in entity && (() => {
          const k = entity as ContractEntity;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-t pt-2">
              <div>
                <div className="text-muted-foreground">رقم العقد</div>
                <div className="font-mono">{k.contractNumber || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">حالة العقد</div>
                <div>{k.status || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">سريان من</div>
                <div>{fmtDate(k.startDate)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">سريان إلى</div>
                <div>{fmtDate(k.endDate)}</div>
              </div>
            </div>
          );
        })()}

        {("name" in entity || "code" in entity) && (source === "recurring_schedule" || source.includes("project")) && (() => {
          const p = entity as ProjectEntity;
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="col-span-2">
                <div className="text-muted-foreground">المشروع</div>
                <div className="font-medium">{p.name || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">رمز المشروع</div>
                <div className="font-mono">{p.code || "—"}</div>
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
