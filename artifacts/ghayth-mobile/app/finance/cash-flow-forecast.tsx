import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CashFlowForecastItem {
  period?: string;
  inflows?: number;
  outflows?: number;
  net?: number;
  cumulativeBalance?: number;
  currency?: string;
}

export default function CashFlowForecastScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CashFlowForecastItem[]>('/api/cash-flow-forecast');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل توقعات التدفق النقدي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'توقعات التدفق النقدي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد توقعات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 6 }}>{item.period ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.inflows != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#22C55E' }}>تدفقات داخلة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#22C55E' }}>{item.inflows.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.outflows != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#EF4444' }}>تدفقات خارجة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{item.outflows.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.net != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>الصافي</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: (item.net ?? 0) < 0 ? '#EF4444' : c.brand }}>{item.net.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>
              </View> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
