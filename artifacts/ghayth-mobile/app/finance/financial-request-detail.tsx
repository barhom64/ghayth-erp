import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinancialRequest { id?: number; type?: string; amount?: number; status?: string; requestedBy?: string; createdAt?: string; description?: string; }

export default function FinancialRequestDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinancialRequest>('/api/finance/financial-requests/0');
  const d = (data && !Array.isArray(data)) ? data as FinancialRequest : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل الطلب المالي' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'النوع', value: d?.type }, { label: 'المبلغ', value: d?.amount?.toLocaleString('ar-SA') ? `${d.amount.toLocaleString('ar-SA')} ر.س` : undefined }, { label: 'الحالة', value: d?.status }, { label: 'طلب من', value: d?.requestedBy }, { label: 'تاريخ الطلب', value: d?.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'الوصف', value: d?.description }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
