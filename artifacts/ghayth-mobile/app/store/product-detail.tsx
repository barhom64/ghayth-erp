/**
 * تفاصيل المنتج
 * GET /api/store/products/:id
 */
import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface Product {
  id: number;
  name?: string;
  sku?: string;
  category?: string;
  price?: number;
  costPrice?: number;
  stock?: number;
  unit?: string;
  description?: string;
  isActive?: boolean;
  barcode?: string;
  taxRate?: number;
  minStock?: number;
}

export default function ProductDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const endpoint = `/api/store/products/${id}`;
  const { data, isLoading, isError } = useList<Product>(endpoint);
  const { refreshing, onRefresh } = useRefresh([[endpoint]]);
  const product = Array.isArray(data) ? data[0] : data as Product | null;

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError || !product) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={onRefresh} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: product.name ?? 'المنتج' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'right', marginBottom: 12 }}>{product.name ?? '—'}</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 20, flexWrap: 'wrap' }}>
            {product.price != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: c.brand }}>{product.price} ر.س</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>سعر البيع</Text>
              </View>
            )}
            {product.costPrice != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{product.costPrice} ر.س</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>سعر التكلفة</Text>
              </View>
            )}
            {product.stock != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: product.stock < (product.minStock ?? 5) ? '#EF4444' : '#22C55E' }}>
                  {product.stock}
                </Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>المخزون</Text>
              </View>
            )}
          </View>
        </GCard>

        <GCard>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>بيانات المنتج</Text>
          {[
            { label: 'رمز المنتج', value: product.sku },
            { label: 'الباركود', value: product.barcode },
            { label: 'الفئة', value: product.category },
            { label: 'الوحدة', value: product.unit },
            { label: 'نسبة الضريبة', value: product.taxRate != null ? `${product.taxRate}%` : null },
            { label: 'الحد الأدنى للمخزون', value: product.minStock != null ? String(product.minStock) : null },
            { label: 'الحالة', value: product.isActive ? 'نشط' : 'غير نشط' },
          ].filter(r => r.value).map(row => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{row.value}</Text>
            </View>
          ))}
        </GCard>

        {product.description ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>الوصف</Text>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 22 }}>{product.description}</Text>
          </GCard>
        ) : null}
      </ScrollView>
    </View>
  );
}
