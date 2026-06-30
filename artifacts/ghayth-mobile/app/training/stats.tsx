import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingStats { totalPrograms?: number; activePrograms?: number; totalEnrollments?: number; completedEnrollments?: number; avgScore?: number; completionRate?: number; }

export default function TrainingStats() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingStats>('/api/training/stats');
  const d = (data && !Array.isArray(data)) ? data as TrainingStats : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number | string, color?: string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: color ?? c.brand, fontSize: 24, fontWeight: '700' }}>{value ?? '—'}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إحصائيات التدريب' }} />
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('إجمالي البرامج', d.totalPrograms)}
        {stat('البرامج النشطة', d.activePrograms)}
        {stat('إجمالي التسجيلات', d.totalEnrollments)}
        {stat('التسجيلات المكتملة', d.completedEnrollments, '#22c55e')}
        {stat('متوسط الدرجة', d.avgScore)}
        {stat('معدل الإكمال %', d.completionRate !== undefined ? `${d.completionRate}%` : undefined)}
      </View>
    </ScrollView>
  );
}
