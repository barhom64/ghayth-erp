import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceHygiene {
  invoicesWithoutPayment?: number;
  paymentsWithoutInvoice?: number;
  unlinkedAgentInvoices?: number;
  overchargedPilgrims?: number;
  underchargedPilgrims?: number;
  missingGlEntries?: number;
  [key: string]: unknown;
}

export default function UmrahFinanceHygieneScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FinanceHygiene>('/api/umrah/finance-hygiene');
  const d = (data && !Array.isArray(data)) ? data as FinanceHygiene : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل سلامة البيانات المالية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const items = [
    { label: 'فواتير بلا دفع', value: d?.invoicesWithoutPayment ?? 0, color: '#EF4444' },
    { label: 'دفعات بلا فاتورة', value: d?.paymentsWithoutInvoice ?? 0, color: '#EF4444' },
    { label: 'فواتير وكيل غير مربوطة', value: d?.unlinkedAgentInvoices ?? 0, color: '#F59E0B' },
    { label: 'حجاج مُثاقَل عليهم', value: d?.overchargedPilgrims ?? 0, color: '#F59E0B' },
    { label: 'حجاج ناقص تحصيلهم', value: d?.underchargedPilgrims ?? 0, color: '#F59E0B' },
    { label: 'قيود دفتر مفقودة', value: d?.missingGlEntries ?? 0, color: '#EF4444' },
  ];

  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلامة البيانات المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: total > 0 ? '#EF4444' : '#22C55E' }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: total > 0 ? '#EF4444' : '#22C55E' }}>{total}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي المشكلات</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {items.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.value > 0 ? m.color : '#22C55E' }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
