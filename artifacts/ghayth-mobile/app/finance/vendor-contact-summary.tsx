import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VendorContactSummary {
  totalOrders?: number;
  totalPayments?: number;
  lastOrderDate?: string;
  openCommitments?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  balance?: number;
}

export default function VendorContactSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<VendorContactSummary>('/api/finance/vendors/0/contact-summary');
  const d = (data && !Array.isArray(data)) ? data as VendorContactSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص المورد…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص المورد' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          {[
            { label: 'إجمالي الطلبات', value: `${d?.totalOrders ?? 0}` },
            { label: 'إجمالي المفاتير', value: `${Number(d?.totalInvoiced ?? 0).toLocaleString('ar-SA')} ر.س` },
            { label: 'إجمالي المدفوع', value: `${Number(d?.totalPaid ?? 0).toLocaleString('ar-SA')} ر.س` },
            { label: 'الرصيد المستحق', value: `${Number(d?.balance ?? 0).toLocaleString('ar-SA')} ر.س` },
            { label: 'التزامات مفتوحة', value: `${d?.openCommitments ?? 0}` },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.text }}>{row.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{row.value}</Text>
            </View>
          ))}
          {d?.lastOrderDate ? (
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <Text style={{ fontSize: 14, color: c.text }}>آخر طلب</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>
                {new Date(d.lastOrderDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
