import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AmortSchedule { id?: number; assetName?: string; period?: string; amount?: number; status?: string; }

export default function AmortizationSchedulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AmortSchedule[]>('/api/finance/amortization/schedules');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جداول الإطفاء' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد جداول" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.assetName ?? '-'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
              {item.period} | {(item.amount ?? 0).toLocaleString('ar-SA')} ر.س | {item.status ?? '-'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
