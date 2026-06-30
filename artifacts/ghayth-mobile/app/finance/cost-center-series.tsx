import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterSeries {
  period?: string;
  revenue?: number;
  expense?: number;
  profit?: number;
}

export default function CostCenterSeriesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostCenterSeries[]>('/api/finance/cost-centers/0/series');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل السلاسل الزمنية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'السلاسل الزمنية لمركز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.period ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 8 }}>{item.period ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#22C55E' }}>إيراد: {Number(item.revenue ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: '#EF4444' }}>مصاريف: {Number(item.expense ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: (item.profit ?? 0) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                صافي: {Number(item.profit ?? 0).toLocaleString('ar-SA')}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
