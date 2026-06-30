import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SalesInvoicesSummary {
  totalInvoices?: number;
  totalAmount?: number;
  paidAmount?: number;
  unpaidAmount?: number;
  paidCount?: number;
  unpaidCount?: number;
  [key: string]: unknown;
}

export default function SalesInvoicesSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<SalesInvoicesSummary>('/api/umrah/reports/sales-invoices-summary');
  const d = (data && !Array.isArray(data)) ? data as SalesInvoicesSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص فواتير البيع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص فواتير البيع' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: c.brand }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: c.brand }}>{(d?.totalAmount ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>إجمالي الفواتير (ر.س)</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.totalInvoices ?? 0} فاتورة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'مسدّدة', value: `${(d?.paidAmount ?? 0).toLocaleString('ar-SA')} ر.س`, sub: `${d?.paidCount ?? 0} فاتورة`, color: '#22C55E' },
            { label: 'غير مسدّدة', value: `${(d?.unpaidAmount ?? 0).toLocaleString('ar-SA')} ر.س`, sub: `${d?.unpaidCount ?? 0} فاتورة`, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.sub}</Text>
              <Text style={{ fontSize: 11, color: c.textFaint }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
