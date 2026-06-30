import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrModuleDashboard {
  totalEmployees?: number;
  presentToday?: number;
  onLeave?: number;
  pendingRequests?: number;
  openPositions?: number;
  avgPerformanceScore?: number;
  [key: string]: unknown;
}

export default function ModuleDashboardHrScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<HrModuleDashboard>('/api/module-dashboards/hr');
  const d = (data && !Array.isArray(data)) ? data as HrModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الموارد البشرية…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const metrics = [
    { label: 'إجمالي الموظفين', value: d?.totalEmployees ?? 0, color: c.brand },
    { label: 'حاضرون اليوم', value: d?.presentToday ?? 0, color: '#22C55E' },
    { label: 'في إجازة', value: d?.onLeave ?? 0, color: '#F59E0B' },
    { label: 'طلبات معلقة', value: d?.pendingRequests ?? 0, color: '#EF4444' },
    { label: 'وظائف شاغرة', value: d?.openPositions ?? 0, color: '#8B5CF6' },
    { label: 'متوسط الأداء', value: d?.avgPerformanceScore != null ? `${d.avgPerformanceScore}%` : '—', color: c.brand },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الموارد البشرية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ flex: 1, minWidth: '45%', backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
