import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProfitabilityRow {
  groupId?: number;
  groupName?: string;
  season?: string;
  pilgrimsCount?: number;
  totalRevenue?: number;
  totalCost?: number;
  netProfit?: number;
  margin?: number;
}

export default function UmrahProfitabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProfitabilityRow[]>('/api/umrah/reports/profitability');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الربحية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربحية العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.groupId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const profit = item.netProfit ?? 0;
          const profitColor = profit >= 0 ? '#22C55E' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.groupName ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: profitColor }}>{profit.toLocaleString('ar-SA')} ر.س</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.season ? <Text style={{ fontSize: 11, color: c.brand }}>{item.season}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textMuted }}>حجاج: {item.pilgrimsCount ?? 0}</Text>
                {item.margin != null ? <Text style={{ fontSize: 11, color: profitColor }}>هامش: {item.margin}%</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
