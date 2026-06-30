import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TaxSummary {
  totalVatCollected?: number;
  totalVatPaid?: number;
  netVatPosition?: number;
  invoicesCount?: number;
  period?: string;
  currency?: string;
}

export default function FinanceTaxSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TaxSummary>('/api/finance/tax/summary');
  const d = (data && !Array.isArray(data)) ? data as TaxSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الضريبة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const cur = d?.currency ?? 'ر.س';
  const rows = [
    { label: 'ضريبة القيمة المضافة المحصّلة', value: d?.totalVatCollected != null ? `${d.totalVatCollected.toLocaleString('ar-SA')} ${cur}` : '—' },
    { label: 'ضريبة القيمة المضافة المدفوعة', value: d?.totalVatPaid != null ? `${d.totalVatPaid.toLocaleString('ar-SA')} ${cur}` : '—' },
    { label: 'صافي الموقف الضريبي', value: d?.netVatPosition != null ? `${d.netVatPosition.toLocaleString('ar-SA')} ${cur}` : '—' },
    { label: 'عدد الفواتير', value: d?.invoicesCount != null ? String(d.invoicesCount) : '—' },
    { label: 'الفترة', value: d?.period ?? '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الضريبة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
