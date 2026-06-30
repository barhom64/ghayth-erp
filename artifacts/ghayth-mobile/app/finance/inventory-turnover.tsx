import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InventoryTurnover {
  productId?: number;
  productName?: string;
  turnoverRatio?: number;
  costOfGoodsSold?: number;
  averageInventory?: number;
  daysInInventory?: number;
}

export default function InventoryTurnoverScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InventoryTurnover[]>('/api/finance/reports/inventory-turnover');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل معدل دوران المخزون…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معدل دوران المخزون' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.productName ?? '—'}
              </Text>
              {item.turnoverRatio != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                  {Number(item.turnoverRatio).toFixed(2)}×
                </Text>
              ) : null}
            </View>
            {item.daysInInventory != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                أيام في المخزون: {Math.round(item.daysInInventory)}
              </Text>
            ) : null}
            {item.costOfGoodsSold != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                تكلفة البضاعة: {Number(item.costOfGoodsSold).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
