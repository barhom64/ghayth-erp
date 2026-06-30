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
  arBalance?: number;
  apBalance?: number;
  cashBalance?: number;
  overdueInvoices?: number;
  [key: string]: unknown;
}

export default function ModuleDashboardFinanceScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FinanceModuleDashboard>('/api/module-dashboards/finance');
  const d = (data && !Array.isArray(data)) ? data as FinanceModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المالية…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {[
          { label: 'الإيرادات', value: d?.totalRevenue, color: '#22C55E' },
          { label: 'المصروفات', value: d?.totalExpenses, color: '#EF4444' },
          { label: 'صافي الربح', value: d?.netProfit, color: d?.netProfit != null && d.netProfit >= 0 ? '#22C55E' : '#EF4444' },
          { label: 'الذمم المدينة', value: d?.arBalance, color: c.brand },
          { label: 'الذمم الدائنة', value: d?.apBalance, color: '#F59E0B' },
          { label: 'النقدية', value: d?.cashBalance, color: '#22C55E' },
        ].map(m => (
          <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{m.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: m.color }}>
              {m.value != null ? `${m.value.toLocaleString('ar-SA')} ر.س` : '—'}
            </Text>
          </View>
        ))}
        {d?.overdueInvoices != null ? (
          <View style={{ backgroundColor: '#EF444422', borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#EF4444' }}>{d.overdueInvoices}</Text>
            <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>فاتورة متأخرة</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
