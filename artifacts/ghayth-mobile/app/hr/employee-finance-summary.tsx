import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceSummary { totalSalary?: number; totalDeductions?: number; netPay?: number; loans?: number; }

export default function EmployeeFinanceSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinanceSummary>('/api/employees/0/finance-summary');
  const d = (data && !Array.isArray(data)) ? data as FinanceSummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="barcode-outline" title="لا توجد بيانات مالية" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الملخص المالي للموظف' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي الراتب</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.totalSalary != null ? d.totalSalary.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي الخصومات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.totalDeductions != null ? d.totalDeductions.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>صافي الراتب</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.netPay != null ? d.netPay.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>القروض</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.loans != null ? d.loans.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
