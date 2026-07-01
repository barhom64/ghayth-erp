import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Payslip { period?: string; baseSalary?: number; allowances?: number; deductions?: number; netSalary?: number; currency?: string; paymentDate?: string; }

export default function MyPayslip() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Payslip>('/api/my-space/payslip');
  const d = (data && !Array.isArray(data)) ? data as Payslip : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: number | string, highlight?: boolean) => value !== undefined ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: highlight ? c.brand : c.text, fontSize: highlight ? 18 : 13, fontWeight: highlight ? '700' : '400' }}>{typeof value === 'number' ? `${value.toLocaleString('ar-SA')} ر.س` : value}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'قسيمة الراتب' }} />
      {row('الفترة', d.period)}
      {row('الراتب الأساسي', d.baseSalary)}
      {row('البدلات', d.allowances)}
      {row('الاستقطاعات', d.deductions)}
      {row('صافي الراتب', d.netSalary, true)}
      {row('تاريخ الصرف', d.paymentDate ? new Date(d.paymentDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
    </ScrollView>
  );
}
