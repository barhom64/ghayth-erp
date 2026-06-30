import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectsOverview {
  activeProjects?: number;
  completedProjects?: number;
  overdueProjects?: number;
  totalBudget?: number;
  totalSpent?: number;
  currency?: string;
  avgCompletionRate?: number;
}

export default function ProjectsStatsOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ProjectsOverview>('/api/projects/stats/overview');
  const d = (data && !Array.isArray(data)) ? data as ProjectsOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة المشاريع…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const cur = d?.currency ?? 'ر.س';
  const rows = [
    { label: 'المشاريع النشطة', value: d?.activeProjects != null ? String(d.activeProjects) : '—' },
    { label: 'مشاريع مكتملة', value: d?.completedProjects != null ? String(d.completedProjects) : '—' },
    { label: 'مشاريع متأخرة', value: d?.overdueProjects != null ? String(d.overdueProjects) : '—' },
    { label: 'إجمالي الميزانية', value: d?.totalBudget != null ? `${d.totalBudget.toLocaleString('ar-SA')} ${cur}` : '—' },
    { label: 'إجمالي المُنفَق', value: d?.totalSpent != null ? `${d.totalSpent.toLocaleString('ar-SA')} ${cur}` : '—' },
    { label: 'متوسط الإنجاز', value: d?.avgCompletionRate != null ? `${(d.avgCompletionRate * 100).toFixed(0)}%` : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة على المشاريع' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
