import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrStats { totalEmployees?: number; activeEmployees?: number; onLeave?: number; newHires?: number; turnoverRate?: number; }

export default function HrStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<HrStats>('/api/hr/stats');
  const info = (data && !Array.isArray(data)) ? data as HrStats : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!info) return <GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات الموارد البشرية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[
          { label: 'إجمالي الموظفين', value: info.totalEmployees },
          { label: 'الموظفون النشطون', value: info.activeEmployees },
          { label: 'في إجازة', value: info.onLeave },
          { label: 'موظفون جدد', value: info.newHires },
          { label: 'معدل الدوران', value: info.turnoverRate != null ? `${info.turnoverRate.toFixed(1)}%` : undefined },
        ].map(row => row.value != null ? (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, marginBottom: 10 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.brand, fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>{String(row.value)}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
