import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectStatsSummary { totalProjects?: number; activeProjects?: number; completedProjects?: number; totalBudget?: number; totalSpent?: number; }

export default function ProjectsStatsSummary() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectStatsSummary>('/api/projects/stats/summary');
  const d = (data && !Array.isArray(data)) ? data as ProjectStatsSummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص إحصائيات المشاريع' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'إجمالي المشاريع', value: d?.totalProjects }, { label: 'مشاريع نشطة', value: d?.activeProjects }, { label: 'مشاريع مكتملة', value: d?.completedProjects }, { label: 'إجمالي الميزانية', value: d?.totalBudget?.toLocaleString('ar-SA') }, { label: 'المصروف الكلي', value: d?.totalSpent?.toLocaleString('ar-SA') }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
