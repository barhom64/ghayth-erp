import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupplierItem {
  productId?: number;
  productName?: string;
  sku?: string;
  unitPrice?: number;
  lastPurchaseDate?: string;
  leadDays?: number;
}

export default function SupplierItemsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SupplierItem[]>('/api/warehouse/suppliers/0/items');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل منتجات المورد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'منتجات المورد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد منتجات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.productName ?? '—'}</Text>
              {item.unitPrice != null ? (
                <Text style={{ fontSize: 13, color: c.brand }}>{Number(item.unitPrice).toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.sku ? <Text style={{ fontSize: 12, color: c.textMuted }}>SKU: {item.sku}</Text> : null}
              {item.leadDays != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>مدة التوريد: {item.leadDays} يوم</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
