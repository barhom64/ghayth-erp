import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecruitmentStats {
  openPostings?: number;
  totalApplications?: number;
  newApplications?: number;
  scheduledInterviews?: number;
  [key: string]: unknown;
}

export default function RecruitmentStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<RecruitmentStats>('/api/hr/recruitment/stats');
  const d = (data && !Array.isArray(data)) ? data as RecruitmentStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات التوظيف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات التوظيف' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'وظائف مفتوحة', value: d?.openPostings ?? 0, color: '#22C55E' },
            { label: 'طلبات جديدة', value: d?.newApplications ?? 0, color: c.brand },
            { label: 'إجمالي الطلبات', value: d?.totalApplications ?? 0, color: c.text },
            { label: 'مقابلات مجدولة', value: d?.scheduledInterviews ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
