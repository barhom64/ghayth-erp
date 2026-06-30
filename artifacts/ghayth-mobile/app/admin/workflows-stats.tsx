import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WorkflowStats {
  total?: number;
  pending?: number;
  completed?: number;
  avgDurationHours?: number;
  onTimeRate?: number;
}

export default function AdminWorkflowsStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<WorkflowStats>('/api/workflows/stats');
  const d = (data && !Array.isArray(data)) ? data as WorkflowStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصائيات سير العمل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات سير العمل' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'إجمالي', value: String(d?.total ?? 0) },
          { label: 'معلّقة', value: String(d?.pending ?? 0) },
          { label: 'مكتملة', value: String(d?.completed ?? 0) },
          { label: 'متوسط المدة (ساعات)', value: (d?.avgDurationHours ?? 0).toFixed(1) },
          { label: 'معدل الالتزام بالوقت', value: `${((d?.onTimeRate ?? 0) * 100).toFixed(1)}%` },
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
