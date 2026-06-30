import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Customer360 {
  clientId?: number;
  totalRevenue?: number;
  outstandingAR?: number;
  dso?: number;
  lastInvoiceDate?: string;
  riskScore?: string;
  invoiceCount?: number;
}

export default function Customer360Screen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Customer360>('/api/finance/algorithms/customer-360/0');
  const d = (data && !Array.isArray(data)) ? data as Customer360 : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['إجمالي الإيراد', (d.totalRevenue ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['الذمم المدينة', (d.outstandingAR ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['DSO (أيام)', String(d.dso ?? '-')],
    ['عدد الفواتير', String(d.invoiceCount ?? 0)],
    ['آخر فاتورة', d.lastInvoiceDate ? new Date(d.lastInvoiceDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['درجة المخاطرة', d.riskScore ?? '-'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملف العميل 360' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
