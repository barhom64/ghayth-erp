import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Movement { id?: number; productName?: string; type?: string; quantity?: number; date?: string; warehouseName?: string; reference?: string; }

export default function WarehouseMovementDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Movement>(`/api/warehouse/movements/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Movement : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="swap-horizontal-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل الحركة' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'المنتج', value: d.productName },
          { label: 'النوع', value: d.type },
          { label: 'الكمية', value: d.quantity != null ? String(d.quantity) : undefined },
          { label: 'المستودع', value: d.warehouseName },
          { label: 'المرجع', value: d.reference },
          { label: 'التاريخ', value: d.date ? new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
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
