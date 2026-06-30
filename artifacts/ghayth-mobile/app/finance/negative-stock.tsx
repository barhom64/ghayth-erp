import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NegativeStockItem {
  productId?: number;
  productName?: string;
  warehouseName?: string;
  quantity?: number;
  unit?: string;
}

export default function NegativeStockScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NegativeStockItem[]>('/api/finance/reports/negative-stock');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المخزون السالب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المخزون السالب' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا يوجد مخزون سالب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.productName ?? '—'}
              </Text>
              <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>
                {item.quantity ?? 0} {item.unit ?? ''}
              </Text>
            </View>
            {item.warehouseName ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.warehouseName}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
