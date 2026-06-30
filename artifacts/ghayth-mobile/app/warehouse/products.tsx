/**
 * المنتجات والمخزون
 * GET /api/warehouse/products
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WarehouseProduct {
  id: number;
  sku?: string;
  name?: string;
  category?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  costPrice?: number;
  sellPrice?: number;
  currency?: string;
  status?: string;
}

export default function WarehouseProductsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<WarehouseProduct[]>('/api/warehouse/products');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المنتجات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المنتجات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد منتجات" description="" />}
        renderItem={({ item }) => {
          const isLowStock = item.minStock != null && (item.currentStock ?? 0) <= item.minStock;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/warehouse/product-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.sku ? <Text style={{ fontSize: 11, color: c.brand }}>{item.sku}</Text> : null}
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.category ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.category}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isLowStock ? '#EF4444' : c.text }}>
                  {item.currentStock ?? 0} {item.unit ?? ''}
                </Text>
                {isLowStock ? <Text style={{ fontSize: 11, color: '#EF4444' }}>⚠ منخفض</Text> : null}
                {item.sellPrice != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.sellPrice.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
