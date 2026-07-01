import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InventoryValItem { id?: number; productName?: string; quantity?: number; unitCost?: number; totalValue?: number; }

export default function InventoryValuationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InventoryValItem[]>('/api/finance/reports/inventory-valuation');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقييم المخزون' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.productName ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.quantity != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>الكمية: {item.quantity}</Text> : null}
              {item.totalValue != null ? <Text style={{ color: c.brand, fontSize: 13 }}>{item.totalValue.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
