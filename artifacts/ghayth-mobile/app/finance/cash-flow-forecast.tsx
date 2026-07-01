import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ForecastItem { period?: string; inflow?: number; outflow?: number; netFlow?: number; }

export default function CashFlowForecastScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ForecastItem[]>('/api/finance/cash-flow-forecast');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'توقعات التدفق النقدي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.period ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="water-outline" title="لا توجد توقعات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.inflow != null ? <Text style={{ color: '#38a169', fontSize: 12 }}>داخل: {item.inflow.toLocaleString('ar-SA')}</Text> : null}
              {item.outflow != null ? <Text style={{ color: '#e53e3e', fontSize: 12 }}>خارج: {item.outflow.toLocaleString('ar-SA')}</Text> : null}
              {item.netFlow != null ? <Text style={{ color: c.brand, fontSize: 13 }}>صافي: {item.netFlow.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
