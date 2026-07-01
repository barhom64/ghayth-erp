import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface YoyData { period?: string; currentYear?: number; previousYear?: number; change?: number; changePercent?: number; }

export default function CostCenterYoy() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<YoyData[]>(`/api/finance/cost-centers/${id ?? '0'}/yoy`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مقارنة سنة بسنة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات مقارنة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.currentYear !== undefined && <Text style={{ color: c.brand, fontSize: 13 }}>{item.currentYear.toLocaleString('ar-SA')}</Text>}
              {item.changePercent !== undefined && <Text style={{ color: (item.changePercent ?? 0) >= 0 ? '#22c55e' : '#ef4444', fontSize: 13 }}>{item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
