import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InventoryValuationItem {
  productId?: number;
  productName?: string;
  quantity?: number;
  unitCost?: number;
  totalValue?: number;
  currency?: string;
  warehouseName?: string;
}

export default function InventoryValuationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InventoryValuationItem[]>('/api/reports/inventory-valuation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقييم المخزون…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقييم المخزون' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد بيانات تقييم" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
              {item.totalValue != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.totalValue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.quantity != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الكمية: {item.quantity}</Text> : null}
              {item.unitCost != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>تكلفة الوحدة: {item.unitCost.toLocaleString('ar-SA')}</Text> : null}
              {item.warehouseName ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.warehouseName}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
