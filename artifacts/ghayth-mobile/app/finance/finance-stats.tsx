import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceStats { totalAccounts?: number; totalJournals?: number; pendingApprovals?: number; openPeriods?: number; [key: string]: unknown; }

export default function FinanceStats() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinanceStats>('/api/finance/stats');
  const stats = (data && !Array.isArray(data)) ? data as FinanceStats : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل الإحصائيات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {stats ? Object.entries(stats).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>{String(v ?? '—')}</Text>
          </View>
        )) : <GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
