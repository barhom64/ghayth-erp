import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectsStats {
  totalProjects?: number;
  activeProjects?: number;
  completedProjects?: number;
  delayedProjects?: number;
  atRiskProjects?: number;
  totalBudget?: number;
  spentBudget?: number;
  budgetUtilization?: number;
  avgProgress?: number;
  openTasks?: number;
  overdueTasks?: number;
  [key: string]: unknown;
}

export default function ProjectsStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ProjectsStats>('/api/projects/stats/summary');
  const d = (data && !Array.isArray(data)) ? data as ProjectsStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات المشاريع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const progress = d?.avgProgress ?? 0;
  const progressColor = progress >= 80 ? '#22C55E' : progress >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات المشاريع' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: progressColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: progressColor }}>{progress}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>متوسط التقدم</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.activeProjects ?? 0} مشروع نشط من {d?.totalProjects ?? 0}</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'منجزة', value: d?.completedProjects ?? 0, color: '#22C55E' },
            { label: 'متأخرة', value: d?.delayedProjects ?? 0, color: '#EF4444' },
            { label: 'بخطر', value: d?.atRiskProjects ?? 0, color: '#F59E0B' },
            { label: 'مهام مفتوحة', value: d?.openTasks ?? 0, color: c.brand },
            { label: 'مهام متأخرة', value: d?.overdueTasks ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.totalBudget != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>استخدام الميزانية</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.budgetUtilization ?? 0}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: '#3B82F6', width: `${Math.min(d.budgetUtilization ?? 0, 100)}%` as never }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: c.textFaint }}>المصروف: {(d.spentBudget ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textFaint }}>الإجمالي: {d.totalBudget.toLocaleString('ar-SA')}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
