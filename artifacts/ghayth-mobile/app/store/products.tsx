/**
 * متجر المنتجات
 * GET /api/store/products
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Product {
  id: number;
  name?: string;
  sku?: string;
  category?: string;
  price?: number;
  stock?: number;
  unit?: string;
  isActive?: boolean;
}

interface StoreStats {
  totalProducts?: number;
  totalOrders?: number;
  revenue?: number;
  lowStockCount?: number;
}

export default function StoreProductsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Product[]>('/api/store/products');
  const { data: stats } = useList<StoreStats>('/api/store/stats');
  const list = Array.isArray(data) ? data : [];
  const st = stats && !Array.isArray(stats) ? (stats as StoreStats) : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل المنتجات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'منتجات المتجر' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListHeaderComponent={st ? (
          <GCard style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 20, flexWrap: 'wrap' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand }}>{st.totalProducts ?? 0}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>منتج</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{st.totalOrders ?? 0}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>طلب</Text>
              </View>
              {st.lowStockCount != null && st.lowStockCount > 0 ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>{st.lowStockCount}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>مخزون منخفض</Text>
                </View>
              ) : null}
            </View>
          </GCard>
        ) : null}
        ListEmptyComponent={<GEmptyState icon="bag-outline" title="لا توجد منتجات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/store/product-detail' as never, params: { id: item.id } })}
            style={[styles.row, { backgroundColor: c.surface, borderRadius: 10 }]}
          >
            <View style={[styles.icon, { backgroundColor: c.brand + '20' }]}>
              <Ionicons name="bag-outline" size={20} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.sku ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{item.sku}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 4 }}>
                {item.price != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.brand }}>{item.price} ر.س</Text>
                ) : null}
                {item.stock != null ? (
                  <Text style={{ fontSize: 12, color: item.stock < 5 ? '#EF4444' : c.textMuted }}>
                    {item.stock} {item.unit ?? 'وحدة'}
                  </Text>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-back-outline" size={16} color={c.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
