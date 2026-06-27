/**
 * تفاصيل السجل — عرض key-value مع ترجمة المفاتيح للعربية
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GCard, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { statusBadge } from '@/lib/moduleSections';
import { getRecord } from '@/lib/recordStore';

const LABELS: Record<string, string> = {
  id: 'المعرّف', ref: 'المرجع', status: 'الحالة', name: 'الاسم', title: 'العنوان',
  description: 'الوصف', total: 'الإجمالي', totalAmount: 'الإجمالي', amount: 'المبلغ',
  paidAmount: 'المبلغ المدفوع', balance: 'الرصيد', cost: 'التكلفة', budget: 'الميزانية',
  salary: 'الراتب', estimatedValue: 'القيمة المتوقعة', value: 'القيمة', probability: 'الاحتمالية',
  date: 'التاريخ', createdAt: 'تاريخ الإنشاء', updatedAt: 'آخر تحديث', dueDate: 'تاريخ الاستحقاق',
  startDate: 'تاريخ البداية', endDate: 'تاريخ النهاية', issueDate: 'تاريخ الإصدار',
  closingDate: 'تاريخ الإغلاق', filingDate: 'تاريخ القيد', effectiveDate: 'تاريخ السريان',
  expiryDate: 'تاريخ الانتهاء', arrivalDate: 'تاريخ الوصول', departureDate: 'تاريخ المغادرة',
  lastRun: 'آخر تشغيل', clientName: 'العميل', customerName: 'العميل', tenantName: 'المستأجر',
  supplierName: 'المورد', vendorName: 'المورد', agentName: 'الوكيل', driverName: 'السائق',
  assigneeName: 'المسؤول', requesterName: 'مقدّم الطلب', email: 'البريد الإلكتروني',
  phone: 'الهاتف', code: 'الرمز', type: 'النوع', category: 'التصنيف', priority: 'الأولوية',
  plateNumber: 'رقم اللوحة', vehiclePlate: 'رقم اللوحة', make: 'الصنع', model: 'الطراز',
  sku: 'رمز المنتج', quantityOnHand: 'الكمية المتاحة', passportNumber: 'رقم الجواز',
  visaNumber: 'رقم التأشيرة', groupName: 'المجموعة', groupNumber: 'رقم المجموعة',
  pilgrimCount: 'عدد المعتمرين', court: 'المحكمة', version: 'الإصدار', role: 'الدور',
  branchName: 'الفرع', companyName: 'الشركة', jobTitle: 'المسمى الوظيفي',
  empNumber: 'الرقم الوظيفي', taxNumber: 'الرقم الضريبي', contractNumber: 'رقم العقد',
  ticketNumber: 'رقم التذكرة', subject: 'الموضوع', unitNumber: 'رقم الوحدة',
  buildingName: 'المبنى', caseNumber: 'رقم القضية', invoiceNumber: 'رقم الفاتورة',
  orderNumber: 'رقم الأمر', stationName: 'المحطة',
};

const HIDDEN = new Set(['deletedAt', 'password', 'passwordHash', 'companyId', 'branchId', 'tenantId']);
const DATE_KEYS = /(date|createdat|updatedat|lastrun)/i;
const MONEY_KEYS = /(total|amount|balance|cost|budget|salary|value|price|paid)/i;

function formatDate(val: unknown): string {
  if (!val) return '—';
  try { return new Date(String(val)).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return String(val); }
}

function formatCurrency(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return String(val ?? '');
  return n.toLocaleString('ar-SA') + ' ر.س';
}

export default function RecordScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const stored = getRecord();
  const title = stored?.title ?? 'تفاصيل';
  const row: Record<string, unknown> = stored?.row ?? {};

  const entries = Object.entries(row).filter(
    ([k, v]) => !HIDDEN.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'object',
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen options={{ title: title || 'تفاصيل' }} />
      {entries.length === 0 ? (
        <GEmptyState icon="document-outline" title="لا تفاصيل" description="لا توجد بيانات لعرضها لهذا السجل." />
      ) : (
        <GCard>
          {entries.map(([k, v], i) => {
            const label = LABELS[k] ?? k;
            let displayValue: React.ReactNode;

            if (typeof v === 'boolean') {
              displayValue = v ? 'نعم' : 'لا';
            } else if (k === 'status' && typeof v === 'string') {
              const st = statusBadge(v);
              displayValue = st ? <GStatusBadge status={st.label} size="sm" /> : String(v);
            } else if (DATE_KEYS.test(k)) {
              displayValue = formatDate(v);
            } else if (MONEY_KEYS.test(k) && !Number.isNaN(Number(v))) {
              displayValue = formatCurrency(v);
            } else {
              displayValue = String(v);
            }

            return (
              <View
                key={k}
                style={[
                  styles.row,
                  { borderBottomColor: c.border },
                  i < entries.length - 1 && { borderBottomWidth: 1 },
                ]}
              >
                <View style={styles.valueCell}>
                  {typeof displayValue === 'string' ? (
                    <Text style={{ fontSize: 14, color: c.text, textAlign: 'right' }}>{displayValue}</Text>
                  ) : displayValue}
                </View>
                <Text style={[styles.labelText, { color: c.textMuted }]}>{label}</Text>
              </View>
            );
          })}
        </GCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  labelText: { fontSize: 13, fontWeight: '500', textAlign: 'right', minWidth: 100 },
  valueCell: { flex: 1, alignItems: 'flex-start', paddingRight: 12 },
});
