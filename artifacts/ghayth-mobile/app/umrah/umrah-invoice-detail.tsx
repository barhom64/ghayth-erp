import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Invoice { id?: number; number?: string; clientName?: string; total?: number; status?: string; date?: string; }

export default function UmrahInvoiceDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Invoice>(`/api/umrah/invoices/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Invoice : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="document-text-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `فاتورة ${d.number ?? ''}` }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'رقم الفاتورة', value: d.number },
          { label: 'العميل', value: d.clientName },
          { label: 'الإجمالي', value: d.total != null ? `${d.total.toLocaleString('ar-SA')} ر.س` : undefined },
          { label: 'التاريخ', value: d.date ? new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
          { label: 'الحالة', value: d.status },
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
