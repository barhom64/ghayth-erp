import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InsightsSummary { totalAlerts?: number; criticalCount?: number; topKPI?: string; topRecommendation?: string; activityStats?: { total?: number; today?: number; }; }

export default function InsightsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InsightsSummary>('/api/intelligence/insights-summary');
  const d = (data && !Array.isArray(data)) ? data as InsightsSummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined && value !== null ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13, flex: 1, textAlign: 'left' }}>{String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'ملخص الرؤى الذكية' }} />
      {row('إجمالي التنبيهات', d.totalAlerts)}
      {row('التنبيهات الحرجة', d.criticalCount)}
      {row('أبرز مؤشر', d.topKPI)}
      {row('أبرز توصية', d.topRecommendation)}
      {d.activityStats && row('نشاط اليوم', d.activityStats.today)}
      {d.activityStats && row('إجمالي النشاط', d.activityStats.total)}
    </ScrollView>
  );
}
