import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceSummary { totalRevenue?: number; totalExpenses?: number; netProfit?: number; cashBalance?: number; [key: string]: unknown; }

export default function FinanceSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinanceSummary>('/api/finance/summary');
  const summary = (data && !Array.isArray(data)) ? data as FinanceSummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل الملخص…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {summary ? Object.entries(summary).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>{typeof v === 'number' ? v.toLocaleString('ar-SA') + ' ر.س' : String(v ?? '—')}</Text>
          </View>
        )) : <GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
