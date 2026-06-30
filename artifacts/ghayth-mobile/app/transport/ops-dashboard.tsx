import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OpsDashboard {
  totalTrips?: number;
  activeTrips?: number;
  completedToday?: number;
  pendingDispatches?: number;
  onTimeRate?: number;
  avgDuration?: number;
  [key: string]: unknown;
}

export default function TransportOpsDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OpsDashboard>('/api/transport/ops-dashboard');
  const d = (data && !Array.isArray(data)) ? data as OpsDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة العمليات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={() => {}} />
  );

  const stats = [
    { label: 'إجمالي الرحلات', value: String(d?.totalTrips ?? 0), color: c.brand },
    { label: 'نشطة الآن', value: String(d?.activeTrips ?? 0), color: '#22C55E' },
    { label: 'مكتملة اليوم', value: String(d?.completedToday ?? 0), color: '#3B82F6' },
    { label: 'إسنادات معلّقة', value: String(d?.pendingDispatches ?? 0), color: '#F59E0B' },
    { label: 'معدل الالتزام بالمواعيد', value: d?.onTimeRate != null ? `${(d.onTimeRate * 100).toFixed(1)}%` : '—', color: d?.onTimeRate && d.onTimeRate >= 0.85 ? '#22C55E' : '#EF4444' },
    { label: 'متوسط مدة الرحلة (دق)', value: d?.avgDuration != null ? String(Math.round(d.avgDuration as number)) : '—', color: c.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة عمليات النقل' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {stats.map(s => (
            <View key={s.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: 3, borderTopColor: s.color }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color, marginBottom: 4 }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
