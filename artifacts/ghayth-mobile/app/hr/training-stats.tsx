import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingStats {
  totalPrograms?: number;
  activePrograms?: number;
  totalEnrollments?: number;
  completedEnrollments?: number;
  [key: string]: unknown;
}

export default function TrainingStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TrainingStats>('/api/hr/training/stats');
  const d = (data && !Array.isArray(data)) ? data as TrainingStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات التدريب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const total = d?.totalEnrollments ?? 0;
  const completed = d?.completedEnrollments ?? 0;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const rateColor = rate >= 70 ? '#22C55E' : rate >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات التدريب' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الإتمام</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{completed} من {total} تسجيل</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'برامج نشطة', value: d?.activePrograms ?? 0, color: '#22C55E' },
            { label: 'إجمالي البرامج', value: d?.totalPrograms ?? 0, color: c.text },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
