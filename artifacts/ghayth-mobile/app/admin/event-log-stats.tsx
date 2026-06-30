import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EventLogStats {
  total?: number;
  last24h?: number;
  byType?: Record<string, number>;
  errorRate?: number;
}

export default function AdminEventLogStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<EventLogStats>('/api/events/log/stats');
  const d = (data && !Array.isArray(data)) ? data as EventLogStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصائيات السجل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات سجل الأحداث' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'إجمالي الأحداث', value: String(d?.total ?? 0) },
          { label: 'آخر 24 ساعة', value: String(d?.last24h ?? 0) },
          { label: 'معدل الأخطاء', value: `${((d?.errorRate ?? 0) * 100).toFixed(2)}%` },
        ].map((row) => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14,
            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
