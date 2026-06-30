import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExecOverview {
  revenue?: number;
  expenses?: number;
  netProfit?: number;
  cashBalance?: number;
  arBalance?: number;
  apBalance?: number;
  [key: string]: unknown;
}

export default function ExecDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ExecOverview>('/api/exec-dashboard/overview');
  const d = (data && !Array.isArray(data)) ? data as ExecOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة التنفيذية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const metrics = [
    { label: 'الإيراد', value: d?.revenue ?? 0, color: '#22C55E' },
    { label: 'المصروفات', value: d?.expenses ?? 0, color: '#EF4444' },
    { label: 'صافي الربح', value: d?.netProfit ?? 0, color: (d?.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444' },
    { label: 'رصيد النقد', value: d?.cashBalance ?? 0, color: c.brand },
    { label: 'ذمم مدينة', value: d?.arBalance ?? 0, color: '#F59E0B' },
    { label: 'ذمم دائنة', value: d?.apBalance ?? 0, color: '#8B5CF6' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'اللوحة التنفيذية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: 3, borderTopColor: m.color }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: m.color, marginBottom: 4 }}>{m.value.toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
