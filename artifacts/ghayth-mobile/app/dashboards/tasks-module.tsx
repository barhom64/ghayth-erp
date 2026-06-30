import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TasksModuleDashboard {
  totalTasks?: number;
  completedTasks?: number;
  overdueTasks?: number;
  pendingTasks?: number;
  inProgressTasks?: number;
  completionRate?: number;
  todayDue?: number;
  [key: string]: unknown;
}

export default function TasksModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TasksModuleDashboard>('/api/module-dashboards/tasks');
  const d = (data && !Array.isArray(data)) ? data as TasksModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المهام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.completionRate ?? 0;
  const rateColor = rate >= 80 ? '#22C55E' : rate >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة المهام' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الإنجاز</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.completedTasks ?? 0} / {d?.totalTasks ?? 0} مهمة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'قيد التنفيذ', value: d?.inProgressTasks ?? 0, color: '#3B82F6' },
            { label: 'متأخرة', value: d?.overdueTasks ?? 0, color: '#EF4444' },
            { label: 'معلقة', value: d?.pendingTasks ?? 0, color: '#F59E0B' },
            { label: 'تستحق اليوم', value: d?.todayDue ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
