import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RevenuePoint { period?: string; amount?: number; }

export default function DashboardChartsRevenue() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RevenuePoint[]>('/api/dashboard/charts/revenue');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الإيراد…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخطط الإيرادات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? '—'}</Text>
            <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>{(item.amount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
        )}
      />
    </View>
  );
}
