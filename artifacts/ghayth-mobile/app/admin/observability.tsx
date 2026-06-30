import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ObservabilityOverview {
  eventsLastHour?: number;
  eventsLast24h?: number;
  dlqUnresolved?: number;
  dlqResolved?: number;
  p95Latency?: number;
  errorRate?: number;
  [key: string]: unknown;
}

export default function ObservabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ObservabilityOverview>('/api/admin/observability/overview');
  const d = (data && !Array.isArray(data)) ? data as ObservabilityOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المراقبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const stats = [
    { label: 'أحداث آخر ساعة', value: String(d?.eventsLastHour ?? 0), color: c.brand },
    { label: 'أحداث 24 ساعة', value: String(d?.eventsLast24h ?? 0), color: '#3B82F6' },
    { label: 'طابور أخطاء معلّق', value: String(d?.dlqUnresolved ?? 0), color: (d?.dlqUnresolved ?? 0) > 0 ? '#EF4444' : '#22C55E' },
    { label: 'P95 التأخير (ms)', value: d?.p95Latency != null ? String(Math.round(d.p95Latency as number)) : '—', color: '#F59E0B' },
    { label: 'معدل الأخطاء', value: d?.errorRate != null ? `${((d.errorRate as number) * 100).toFixed(2)}%` : '—', color: (d?.errorRate ?? 0) > 0.01 ? '#EF4444' : '#22C55E' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة مراقبة النظام' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {stats.map(s => (
            <View key={s.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: 3, borderTopColor: s.color }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: s.color, marginBottom: 4 }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
