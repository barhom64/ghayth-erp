import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface QueueStats {
  pending?: number;
  processing?: number;
  failed?: number;
  completed?: number;
  avgProcessingMs?: number;
  [key: string]: unknown;
}

export default function CommsQueueStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<QueueStats>('/api/communications/queue-stats');
  const d = (data && !Array.isArray(data)) ? data as QueueStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الطابور…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const stats = [
    { label: 'قيد الانتظار', value: String(d?.pending ?? 0), color: '#F59E0B' },
    { label: 'قيد المعالجة', value: String(d?.processing ?? 0), color: '#3B82F6' },
    { label: 'فشل', value: String(d?.failed ?? 0), color: (d?.failed ?? 0) > 0 ? '#EF4444' : c.text },
    { label: 'مكتمل', value: String(d?.completed ?? 0), color: '#22C55E' },
    { label: 'متوسط المعالجة (ms)', value: d?.avgProcessingMs != null ? String(Math.round(d.avgProcessingMs as number)) : '—', color: c.brand },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات طابور الاتصالات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {stats.map(s => (
            <View key={s.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: 3, borderTopColor: s.color }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color, marginBottom: 4 }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
