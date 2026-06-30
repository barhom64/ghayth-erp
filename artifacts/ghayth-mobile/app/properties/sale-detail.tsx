import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertySale { id?: number; unitId?: number; buyerName?: string; salePrice?: number; saleDate?: string; status?: string; contractNo?: string; }

export default function PropertySaleDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PropertySale>('/api/properties/sales/0');
  const d = (data && !Array.isArray(data)) ? data as PropertySale : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `عملية بيع ${d?.contractNo ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'المشتري', value: d?.buyerName }, { label: 'سعر البيع', value: d?.salePrice?.toLocaleString('ar-SA') ? `${d.salePrice.toLocaleString('ar-SA')} ر.س` : undefined }, { label: 'تاريخ البيع', value: d?.saleDate ? new Date(d.saleDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'رقم العقد', value: d?.contractNo }, { label: 'الحالة', value: d?.status }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
