import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Receivable { id?: number; clientName?: string; amount?: number; dueDate?: string; status?: string; reference?: string; }

export default function ReceivableDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Receivable>(`/api/finance/receivables/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Receivable : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="cash-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل المستحق' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'العميل', value: d.clientName },
          { label: 'المرجع', value: d.reference },
          { label: 'المبلغ', value: d.amount != null ? `${d.amount.toLocaleString('ar-SA')} ر.س` : undefined },
          { label: 'تاريخ الاستحقاق', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
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
