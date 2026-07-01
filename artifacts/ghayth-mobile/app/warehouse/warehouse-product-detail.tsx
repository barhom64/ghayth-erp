import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Product { id?: number; name?: string; sku?: string; categoryName?: string; stock?: number; unit?: string; sellPrice?: number; }

export default function WarehouseProductDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Product>(`/api/warehouse/products/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Product : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="cube-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'تفاصيل المنتج' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'الاسم', value: d.name },
          { label: 'الكود (SKU)', value: d.sku },
          { label: 'الفئة', value: d.categoryName },
          { label: 'المخزون', value: d.stock != null ? `${d.stock} ${d.unit ?? ''}` : undefined },
          { label: 'سعر البيع', value: d.sellPrice != null ? `${d.sellPrice.toLocaleString('ar-SA')} ر.س` : undefined },
        ].map(r => r.value ? (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{r.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{r.value}</Text>
          </View>
        ) : null)}
      </View>
    </ScrollView>
  );
}
