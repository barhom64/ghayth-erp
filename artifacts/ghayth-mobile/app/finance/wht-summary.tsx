import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WhtSummary {
  grandTotal?: number;
  byCategory?: { category: string; total: number }[];
  bySupplier?: { supplierName: string; total: number; residency?: string }[];
}

export default function WhtSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<WhtSummary>('/api/finance/reports/wht-summary');
  const d = (data && !Array.isArray(data)) ? data as WhtSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الاستقطاع…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الاستقطاع (WHT)' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>الإجمالي المستقطع</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 4 }}>
            {d?.grandTotal != null ? Number(d.grandTotal).toLocaleString('ar-SA') : '—'} ر.س
          </Text>
        </View>
        {(d?.byCategory?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 12 }}>حسب الفئة</Text>
            {d!.byCategory!.map((cat, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.byCategory!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text }}>{cat.category}</Text>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{Number(cat.total).toLocaleString('ar-SA')} ر.س</Text>
              </View>
            ))}
          </View>
        ) : null}
        {(d?.bySupplier?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 12 }}>حسب المورد</Text>
            {d!.bySupplier!.map((sup, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.bySupplier!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text }}>{sup.supplierName}</Text>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{Number(sup.total).toLocaleString('ar-SA')} ر.س</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
