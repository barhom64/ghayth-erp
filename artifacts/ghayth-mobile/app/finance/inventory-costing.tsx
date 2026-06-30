import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InventoryCostingItem {
  productId?: number;
  productName?: string;
  averageCost?: number;
  currentStock?: number;
  totalValue?: number;
  costingMethod?: string;
}

export default function InventoryCostingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InventoryCostingItem[]>('/api/finance/inventory-costing');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تكاليف المخزون…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاليف المخزون' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.productName ?? '—'}</Text>
              {item.totalValue != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                  {Number(item.totalValue).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16, marginTop: 4 }}>
              {item.averageCost != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>متوسط التكلفة: {Number(item.averageCost).toLocaleString('ar-SA')}</Text>
              ) : null}
              {item.currentStock != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>المخزون: {item.currentStock}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
