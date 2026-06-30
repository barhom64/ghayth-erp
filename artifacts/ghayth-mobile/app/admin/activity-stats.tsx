import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActivityStats {
  totalActions?: number;
  activeUsers?: number;
  avgActionsPerUser?: number;
  mostActiveModule?: string;
  peakHour?: number;
}

export default function AdminActivityStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ActivityStats>('/api/intelligence/activity/stats');
  const d = (data && !Array.isArray(data)) ? data as ActivityStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصائيات النشاط…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات النشاط' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'إجمالي الإجراءات', value: String(d?.totalActions ?? 0) },
          { label: 'المستخدمون النشطون', value: String(d?.activeUsers ?? 0) },
          { label: 'متوسط الإجراءات/مستخدم', value: (d?.avgActionsPerUser ?? 0).toFixed(1) },
          { label: 'أكثر وحدة نشاطًا', value: d?.mostActiveModule ?? '—' },
          { label: 'ذروة النشاط (الساعة)', value: d?.peakHour != null ? `${d.peakHour}:00` : '—' },
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
