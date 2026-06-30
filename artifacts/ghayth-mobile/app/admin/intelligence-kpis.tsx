import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KpiItem {
  key?: string;
  label?: string;
  value?: number | string;
  unit?: string;
  status?: string;
}

export default function AdminIntelligenceKpisScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<KpiItem[]>('/api/intelligence/kpis');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مؤشرات الأداء…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات الأداء الذكية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {list.length === 0 ? (
          <GEmptyState icon="bar-chart-outline" title="لا توجد مؤشرات" description="" />
        ) : list.map((item, i) => (
          <View key={item.key ?? i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.label ?? item.key ?? '—'}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: item.status === 'warning' ? '#F59E0B' : item.status === 'danger' ? '#EF4444' : '#22C55E' }}>
                {item.value ?? '—'}{item.unit ? ` ${item.unit}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
