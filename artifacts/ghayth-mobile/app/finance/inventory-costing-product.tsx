import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostingData { productId?: number; productName?: string; avgCost?: number; totalCost?: number; quantity?: number; }

export default function InventoryCostingProductScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostingData>('/api/finance/inventory-costing/0');
  const d = (data && !Array.isArray(data)) ? data as CostingData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="cube-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكلفة منتج المخزون' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المنتج</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.productName ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>متوسط التكلفة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.avgCost != null ? d.avgCost.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي التكلفة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.totalCost != null ? d.totalCost.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الكمية</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.quantity ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
