import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BillingCandidate {
  id?: number;
  clientName?: string;
  tripRef?: string;
  amount?: number;
  tripDate?: string;
  status?: string;
}

export default function TransportBillingCandidatesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BillingCandidate[]>('/api/transport-billing-candidates');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مرشحي الفوترة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مرشحو فوترة النقل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا يوجد مرشحون للفوترة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.clientName ?? '—'}</Text>
              {item.tripRef ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>#{item.tripRef}</Text> : null}
              {item.tripDate ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{new Date(item.tripDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text> : null}
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
