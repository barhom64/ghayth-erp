import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BillingCandidate { id?: number; tripId?: number; driverName?: string; amount?: number; status?: string; distance?: number; }

export default function BillingCandidateDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BillingCandidate>('/api/transport-billing-candidates/0');
  const d = (data && !Array.isArray(data)) ? data as BillingCandidate : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل مرشح الفوترة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'السائق', value: d?.driverName }, { label: 'المبلغ', value: d?.amount?.toLocaleString('ar-SA') ? `${d.amount.toLocaleString('ar-SA')} ر.س` : undefined }, { label: 'المسافة', value: d?.distance !== undefined ? `${d.distance} كم` : undefined }, { label: 'الحالة', value: d?.status }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
