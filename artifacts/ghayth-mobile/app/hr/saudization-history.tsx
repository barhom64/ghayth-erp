import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SaudizationRecord {
  id?: number;
  period?: string;
  nitaqatLevel?: string;
  saudiCount?: number;
  totalCount?: number;
  percentage?: number;
}

export default function HrSaudizationHistoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SaudizationRecord[]>('/api/saudization/history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تاريخ السعودة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تاريخ السعودة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد سجلات" description="" />}
        renderItem={({ item }) => {
          const pct = Math.round(item.percentage ?? 0);
          const color = pct >= 75 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.period ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color }}>{pct}%</Text>
              </View>
              {item.nitaqatLevel ? <Text style={{ fontSize: 12, color: c.brand }}>{item.nitaqatLevel}</Text> : null}
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                {item.saudiCount ?? 0} سعودي من {item.totalCount ?? 0}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}
