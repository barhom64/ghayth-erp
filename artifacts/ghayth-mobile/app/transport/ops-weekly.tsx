import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OpsWeekly {
  week?: string;
  totalTrips?: number;
  completedTrips?: number;
  cancelledTrips?: number;
  onTimeRate?: number;
  avgLoadFactor?: number;
}

export default function TransportOpsWeeklyScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<OpsWeekly>('/api/transport/ops-weekly');
  const d = (data && !Array.isArray(data)) ? data as OpsWeekly : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الملخص الأسبوعي…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الملخص الأسبوعي للعمليات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'الأسبوع', value: d?.week ?? '—' },
          { label: 'إجمالي الرحلات', value: String(d?.totalTrips ?? 0) },
          { label: 'الرحلات المكتملة', value: String(d?.completedTrips ?? 0) },
          { label: 'الرحلات الملغاة', value: String(d?.cancelledTrips ?? 0) },
          { label: 'معدل الالتزام بالمواعيد', value: `${((d?.onTimeRate ?? 0) * 100).toFixed(1)}%` },
          { label: 'متوسط معامل الحمولة', value: `${((d?.avgLoadFactor ?? 0) * 100).toFixed(1)}%` },
        ].map((row) => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14,
            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
