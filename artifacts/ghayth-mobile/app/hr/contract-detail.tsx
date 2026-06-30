/**
 * تفاصيل عقد الموظف
 * GET /api/hr/contracts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface EmployeeContract {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  contractType?: string;
  jobTitle?: string;
  department?: string;
  branch?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  approvalStatus?: string;
  salary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  totalPackage?: number;
  currency?: string;
  probationPeriod?: number;
  workHoursPerWeek?: number;
  vacationDaysPerYear?: number;
  noticePeriod?: number;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function HRContractDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: contract, isLoading } = useList<EmployeeContract>(`/api/hr/contracts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقد…" />;
  if (!contract) return <GEmptyState icon="document-text-outline" title="عقد غير موجود" description="تعذّر العثور على بيانات العقد" />;

  const ref = contract.ref ?? `#${contract.id}`;
  const statusStr = contract.approvalStatus ?? contract.status ?? '';
  const st = statusBadge(statusStr);
  const currency = contract.currency;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `عقد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{contract.employeeName ?? '—'}</Text>
          {contract.jobTitle ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{contract.jobTitle}</Text> : null}
          {contract.contractType ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{contract.contractType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(contract.salary, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>الراتب الأساسي</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* بيانات العقد */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>بيانات العقد</GText>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'القسم', value: contract.department },
            { label: 'الفرع', value: contract.branch },
            { label: 'تاريخ البداية', value: fmtDate(contract.startDate) },
            { label: 'تاريخ الانتهاء', value: contract.endDate ? fmtDate(contract.endDate) : 'غير محدد (دائم)' },
            { label: 'فترة التجربة', value: contract.probationPeriod ? `${contract.probationPeriod} شهر` : undefined },
            { label: 'ساعات العمل الأسبوعية', value: contract.workHoursPerWeek ? `${contract.workHoursPerWeek} ساعة` : undefined },
            { label: 'أيام الإجازة السنوية', value: contract.vacationDaysPerYear ? `${contract.vacationDaysPerYear} يوم` : undefined },
            { label: 'فترة الإشعار', value: contract.noticePeriod ? `${contract.noticePeriod} يوم` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* الراتب والمزايا */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>الراتب والمزايا</GText>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الراتب الأساسي', value: fmtMoney(contract.salary, currency) },
            { label: 'بدل السكن', value: contract.housingAllowance ? fmtMoney(contract.housingAllowance, currency) : undefined },
            { label: 'بدل المواصلات', value: contract.transportAllowance ? fmtMoney(contract.transportAllowance, currency) : undefined },
            { label: 'إجمالي الحزمة', value: fmtMoney(contract.totalPackage, currency) },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, fontWeight: row.label === 'إجمالي الحزمة' ? '700' : '400', color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {contract.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{contract.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
