import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Users, FileText, Briefcase, Repeat, FileSpreadsheet, Webhook, PenTool,
} from "lucide-react";
import { UmrahGroupPicker } from "@/components/shared/umrah-group-picker";
import { ClientSelect, ProjectSelect } from "@/components/shared/entity-selects";

// #1812 operational review — closes the user's gap #1:
//   "النقل ما زال 'نموذج إدخال' أكثر من كونه 'محرك تشغيل'. في شاشة
//    الحجز ما زال المستخدم يكتب: من / إلى / اسم العميل / جوال العميل
//    بدل أن يبدأ من: مجموعة عمرة / عقد عميل / مشروع / وقف / حجز
//    سابق / برنامج رحلة. وهذا يخالف هدف تقليل الإدخال اليدوي."
//
// This component is the top-of-form "ابدأ من" picker that comes
// BEFORE the operator types any free-form fields. Selecting a source
// auto-fills the booking with everything that comes from that
// upstream system (customer name, customer phone, customer ID,
// passenger count from umrah group, contract ID, project ID, etc).
//
// Source vocab mirrors the backend BOOKING_SOURCES enum
// (transport-bookings.ts). When `bookingSource = "manual_entry"`,
// no FK is auto-filled — the operator is making a one-off booking.

export interface BookingSourcePrefill {
  bookingSource: string;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  contractId?: number;
  projectId?: number;
  umrahGroupId?: number;
  passengerCount?: number;
  /** #1812 audit fix — renamed from recurringTemplateId (which had no
   *  backend column). Maps to transport_bookings.routePatternId added
   *  in migration 284 — the canonical cargo recurring back-link. */
  routePatternId?: number;
  importJobId?: number;
  externalRef?: string;
}

interface Props {
  /** Currently selected source (synced with form state). */
  currentSource: string;
  /** Called when a source is picked and prefill payload is ready. */
  onPrefill: (p: BookingSourcePrefill) => void;
}

const SOURCE_TILES: {
  value: string;
  label: string;
  icon: typeof Plus;
  description: string;
}[] = [
  { value: "umrah_group",        label: "مجموعة عمرة",   icon: Users,           description: "ابدأ من مجموعة معتمرين قائمة — يُعبَّأ عدد الركاب وبيانات العميل تلقائياً" },
  { value: "customer_request",   label: "طلب عميل",        icon: FileText,        description: "ابدأ من طلب عميل من بوابة العملاء" },
  { value: "contract_schedule",  label: "جدول عقد",        icon: Briefcase,       description: "ابدأ من التزام عقد متكرر أو مرحلة عقد" },
  { value: "recurring_schedule", label: "جدول متكرر",     icon: Repeat,           description: "ابدأ من قالب رحلة متكررة" },
  { value: "import_excel",       label: "استيراد Excel",  icon: FileSpreadsheet,  description: "ابدأ من سجل رفعته الإدارة" },
  { value: "api_integration",    label: "تكامل API",       icon: Webhook,         description: "ابدأ من نظام خارجي عبر API" },
  { value: "manual_entry",       label: "إدخال يدوي",      icon: PenTool,          description: "حجز فوري بدون مصدر — استخدمه فقط للحالات الاستثنائية" },
];

export function BookingSourceSelector({ currentSource, onPrefill }: Props) {
  const [picked, setPicked] = useState<string>(currentSource);
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");

  const handleTilePick = (source: string) => {
    setPicked(source);
    // For sources that don't need a follow-up picker, fire the
    // prefill immediately (e.g. manual_entry, api_integration).
    if (source === "manual_entry" || source === "api_integration" || source === "import_excel") {
      onPrefill({ bookingSource: source });
    }
  };

  return (
    <Card className="border-2 border-status-info-foreground/40 bg-status-info-surface/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-status-info-surface">١</Badge>
          <span className="font-semibold">ابدأ من المصدر</span>
        </div>
        <p className="text-xs text-muted-foreground">
          الحجز يجب أن يبدأ من مصدره — مجموعة عمرة، عقد، عميل، مشروع — حتى يحمل أثره
          إلى المحاسبة والتقارير ولا يتحول إلى مجرد إدخال يدوي.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SOURCE_TILES.map((tile) => {
            const Icon = tile.icon;
            const selected = picked === tile.value;
            return (
              <button
                key={tile.value}
                type="button"
                onClick={() => handleTilePick(tile.value)}
                className={`text-right p-2 border rounded-md transition-colors ${
                  selected
                    ? "border-status-info-foreground bg-status-info-surface"
                    : "border-border bg-white hover:bg-surface-subtle"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-status-info-foreground" />
                  <span className="text-sm font-medium">{tile.label}</span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {tile.description}
                </div>
              </button>
            );
          })}
        </div>

        {picked === "umrah_group" && (
          <div className="border-t pt-3 space-y-2">
            <UmrahGroupPicker
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <Plus className="h-4 w-4 ml-1" />
                  اختر مجموعة عمرة
                </Button>
              }
              onSelect={(g) => {
                onPrefill({
                  bookingSource: "umrah_group",
                  umrahGroupId: g.id,
                  passengerCount: g.mutamerCount,
                  customerName: g.name ?? undefined,
                });
              }}
            />
          </div>
        )}

        {picked === "customer_request" && (
          <div className="border-t pt-3 space-y-2">
            <ClientSelect
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              label="اختر العميل"
            />
            {customerId && (
              <Button
                type="button" size="sm"
                onClick={() =>
                  onPrefill({
                    bookingSource: "customer_request",
                    customerId: Number(customerId),
                  })
                }
              >
                اعتماد العميل وبدء الحجز
              </Button>
            )}
          </div>
        )}

        {picked === "contract_schedule" && (
          <div className="border-t pt-3 space-y-2">
            <ClientSelect
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              label="اختر العميل (لاستخراج العقود)"
            />
            {customerId && (
              <p className="text-xs text-muted-foreground">
                ملاحظة: قائمة العقود ستظهر فور اختيار العميل عند تكامل
                واجهة العقود — حالياً اعتمد العميل وأكمل يدوياً.
              </p>
            )}
            {customerId && (
              <Button
                type="button" size="sm"
                onClick={() =>
                  onPrefill({
                    bookingSource: "contract_schedule",
                    customerId: Number(customerId),
                  })
                }
              >
                اعتماد العقد وبدء الحجز
              </Button>
            )}
          </div>
        )}

        {picked === "recurring_schedule" && (
          <div className="border-t pt-3 space-y-2">
            <ProjectSelect
              value={projectId}
              onChange={(v) => setProjectId(v)}
              label="مشروع (للجدول المتكرر)"
            />
            <Button
              type="button" size="sm"
              onClick={() =>
                onPrefill({
                  bookingSource: "recurring_schedule",
                  projectId: projectId ? Number(projectId) : undefined,
                })
              }
            >
              اعتماد المصدر وبدء الحجز
            </Button>
          </div>
        )}

        {picked === "manual_entry" && (
          <div className="border-t pt-3">
            <p className="text-xs text-status-warning-foreground">
              ⚠️ تنبيه: الإدخال اليدوي لا يربط الحجز بمصدر — استخدمه فقط
              عند عدم وجود عقد / مجموعة / مشروع / طلب عميل. هذا يقلل من
              قيمة الأثر التشغيلي والمحاسبي.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
