import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Card, DetailRow, EmptyState } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDateAr } from "@/lib/format";
import { statusBadge } from "@/lib/moduleSections";
import { getRecord } from "@/lib/recordStore";

const LABELS: Record<string, string> = {
  id: "المعرّف", ref: "المرجع", status: "الحالة", name: "الاسم", title: "العنوان",
  description: "الوصف", total: "الإجمالي", totalAmount: "الإجمالي", amount: "المبلغ",
  paidAmount: "المبلغ المدفوع", balance: "الرصيد", cost: "التكلفة", budget: "الميزانية",
  salary: "الراتب", estimatedValue: "القيمة المتوقعة", value: "القيمة", probability: "الاحتمالية",
  date: "التاريخ", createdAt: "تاريخ الإنشاء", updatedAt: "آخر تحديث", dueDate: "تاريخ الاستحقاق",
  startDate: "تاريخ البداية", endDate: "تاريخ النهاية", issueDate: "تاريخ الإصدار",
  closingDate: "تاريخ الإغلاق", filingDate: "تاريخ القيد", effectiveDate: "تاريخ السريان",
  expiryDate: "تاريخ الانتهاء", arrivalDate: "تاريخ الوصول", departureDate: "تاريخ المغادرة",
  lastRun: "آخر تشغيل", clientName: "العميل", customerName: "العميل", tenantName: "المستأجر",
  supplierName: "المورد", vendorName: "المورد", agentName: "الوكيل", driverName: "السائق",
  assigneeName: "المسؤول", requesterName: "مقدّم الطلب", email: "البريد الإلكتروني",
  phone: "الهاتف", code: "الرمز", type: "النوع", category: "التصنيف", priority: "الأولوية",
  plateNumber: "رقم اللوحة", vehiclePlate: "رقم اللوحة", make: "الصنع", model: "الطراز",
  sku: "رمز المنتج", quantityOnHand: "الكمية المتاحة", passportNumber: "رقم الجواز",
  visaNumber: "رقم التأشيرة", groupName: "المجموعة", groupNumber: "رقم المجموعة",
  pilgrimCount: "عدد المعتمرين", court: "المحكمة", version: "الإصدار", role: "الدور",
  branchName: "الفرع", companyName: "الشركة", jobTitle: "المسمى الوظيفي",
  empNumber: "الرقم الوظيفي", taxNumber: "الرقم الضريبي", contractNumber: "رقم العقد",
  ticketNumber: "رقم التذكرة", subject: "الموضوع", unitNumber: "رقم الوحدة",
  buildingName: "المبنى", caseNumber: "رقم القضية", invoiceNumber: "رقم الفاتورة",
  orderNumber: "رقم الأمر", stationName: "المحطة", fromWarehouse: "من مستودع",
  toWarehouse: "إلى مستودع", origin: "من", destination: "إلى",
};

const HIDDEN = new Set(["deletedAt", "password", "passwordHash", "companyId", "branchId", "tenantId"]);

const DATE_KEYS = /(date|createdat|updatedat|lastrun|^at$)/i;
const MONEY_KEYS = /(total|amount|balance|cost|budget|salary|value|price|paid)/i;

function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

function renderValue(key: string, value: unknown) {
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (key === "status" && typeof value === "string") {
    const st = statusBadge(value);
    return st ? <Badge label={st.label} tone={st.tone} /> : value;
  }
  if (typeof value === "number" || typeof value === "string") {
    if (DATE_KEYS.test(key) && (typeof value === "string" || typeof value === "number")) {
      const formatted = formatDateAr(value);
      if (formatted !== "—") return formatted;
    }
    if (MONEY_KEYS.test(key) && value !== "" && !Number.isNaN(Number(value))) {
      return formatCurrency(value);
    }
    return String(value);
  }
  return JSON.stringify(value);
}

export default function RecordScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const stored = getRecord();
  const title = stored?.title ?? "تفاصيل";
  const row: Record<string, unknown> = stored?.row ?? {};

  const entries = Object.entries(row).filter(
    ([k, v]) => !HIDDEN.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object",
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen options={{ title: title || "تفاصيل" }} />
      {entries.length === 0 ? (
        <EmptyState icon="document-outline" title="لا تفاصيل" message="لا توجد بيانات لعرضها لهذا السجل." />
      ) : (
        <Card>
          {entries.map(([k, v]) => (
            <DetailRow key={k} label={labelFor(k)} value={renderValue(k, v)} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
});
