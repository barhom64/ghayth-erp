import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WarehouseStats {
  totalProducts?: number;
  totalValue?: number;
  lowStockItems?: number;
  outOfStockItems?: number;
  totalMovements?: number;
  pendingReceiving?: number;
  categories?: number;
  suppliers?: number;
  [key: string]: unknown;
}

export default function WarehouseStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<WarehouseStats>('/api/warehouse/stats');
  const d = (data && !Array.isArray(data)) ? data as WarehouseStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات المستودع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات المستودع' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: c.brand }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: c.brand }}>{(d?.totalValue ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي قيمة المخزون (ر.س)</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.totalProducts ?? 0} صنف</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'مخزون منخفض', value: d?.lowStockItems ?? 0, color: '#F59E0B' },
            { label: 'نفد المخزون', value: d?.outOfStockItems ?? 0, color: '#EF4444' },
            { label: 'إجمالي الحركات', value: d?.totalMovements ?? 0, color: c.text },
            { label: 'استلام معلق', value: d?.pendingReceiving ?? 0, color: '#3B82F6' },
            { label: 'التصنيفات', value: d?.categories ?? 0, color: c.textMuted },
            { label: 'الموردون', value: d?.suppliers ?? 0, color: c.brand },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
