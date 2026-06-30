import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceModuleDashboard {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  openInvoices?: number;
  overdueInvoices?: number;
  cashBalance?: number;
  pendingPayments?: number;
  budgetUtilization?: number;
  [key: string]: unknown;
}

export default function FinanceModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FinanceModuleDashboard>('/api/module-dashboards/finance');
  const d = (data && !Array.isArray(data)) ? data as FinanceModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المالية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const profit = d?.netProfit ?? 0;
  const profitColor = profit >= 0 ? '#22C55E' : '#EF4444';

  const metrics = [
    { label: 'الإيرادات', value: (d?.totalRevenue ?? 0).toLocaleString('ar-SA'), color: '#22C55E' },
    { label: 'المصروفات', value: (d?.totalExpenses ?? 0).toLocaleString('ar-SA'), color: '#EF4444' },
    { label: 'فواتير مفتوحة', value: String(d?.openInvoices ?? 0), color: '#F59E0B' },
    { label: 'فواتير متأخرة', value: String(d?.overdueInvoices ?? 0), color: '#EF4444' },
    { label: 'رصيد النقدية', value: (d?.cashBalance ?? 0).toLocaleString('ar-SA'), color: c.text },
    { label: 'مدفوعات معلقة', value: String(d?.pendingPayments ?? 0), color: '#F59E0B' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: profitColor }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: profitColor }}>{profit.toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>صافي الربح (ر.س)</Text>
        </View>
        {d?.budgetUtilization != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>استخدام الميزانية</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.budgetUtilization}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: '#3B82F6', width: `${Math.min(d.budgetUtilization, 100)}%` as never }} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
