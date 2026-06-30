import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CountItem {
  id?: number;
  productName?: string;
  sku?: string;
  systemQty?: number;
  countedQty?: number;
  variance?: number;
  unit?: string;
}

export default function InventoryCountItemsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CountItem[]>('/api/warehouse/inventory-counts/0/items');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بنود الجرد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بنود الجرد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد بنود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.productName ?? '—'}</Text>
              {item.variance != null ? (
                <Text style={{ fontSize: 13, color: item.variance === 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  فرق: {item.variance} {item.unit ?? ''}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>نظام: {item.systemQty ?? 0}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>فعلي: {item.countedQty ?? 0}</Text>
              {item.sku ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.sku}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
