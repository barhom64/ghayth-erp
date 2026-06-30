import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SeasonalPattern {
  id?: number;
  period?: string;
  metric?: string;
  value?: number;
  trend?: string;
  changePercent?: number;
}

export default function SeasonalPatternsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SeasonalPattern[]>('/api/intelligence/seasonal-patterns');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأنماط الموسمية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأنماط الموسمية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.metric ?? '—'}</Text>
              {item.period ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.period}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.value != null ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.value.toLocaleString('ar-SA')}</Text> : null}
              {item.changePercent != null ? (
                <Text style={{ fontSize: 12, color: item.changePercent >= 0 ? '#22C55E' : '#EF4444' }}>
                  {item.changePercent >= 0 ? '▲' : '▼'} {Math.abs(item.changePercent)}%
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
