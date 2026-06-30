import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CorrespondenceStats {
  totalSent?: number;
  totalReceived?: number;
  totalInternal?: number;
  pendingResponse?: number;
  avgResponseHours?: number;
}

export default function CommsCorrespondenceStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CorrespondenceStats>('/api/correspondence/stats/summary');
  const d = (data && !Array.isArray(data)) ? data as CorrespondenceStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصائيات المراسلات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات المراسلات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'إجمالي الصادر', value: String(d?.totalSent ?? 0) },
          { label: 'إجمالي الوارد', value: String(d?.totalReceived ?? 0) },
          { label: 'الداخلي', value: String(d?.totalInternal ?? 0) },
          { label: 'بانتظار الرد', value: String(d?.pendingResponse ?? 0) },
          { label: 'متوسط وقت الرد (ساعات)', value: (d?.avgResponseHours ?? 0).toFixed(1) },
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
