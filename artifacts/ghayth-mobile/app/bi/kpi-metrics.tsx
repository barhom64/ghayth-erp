import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KpiMetric {
  key?: string;
  label?: string;
  value?: number;
  unit?: string;
  trend?: string;
  target?: number;
  category?: string;
}

export default function KpiMetricsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KpiMetric[]>('/api/bi/kpis/metrics');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مؤشرات الأداء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قياسات مؤشرات الأداء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.key ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد مؤشرات" description="" />}
        renderItem={({ item }) => {
          const atTarget = item.target != null && item.value != null && item.value >= item.target;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.label ?? item.key ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: atTarget ? '#22C55E' : c.brand }}>
                  {item.value?.toLocaleString('ar-SA') ?? '—'}{item.unit ? ` ${item.unit}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.category ? <Text style={{ fontSize: 11, color: c.brand }}>{item.category}</Text> : null}
                {item.target != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الهدف: {item.target.toLocaleString('ar-SA')}</Text> : null}
                {item.trend ? <Text style={{ fontSize: 11, color: item.trend === 'up' ? '#22C55E' : '#EF4444' }}>{item.trend === 'up' ? '↑' : '↓'}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
