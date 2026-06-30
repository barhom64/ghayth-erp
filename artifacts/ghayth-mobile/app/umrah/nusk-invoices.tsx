import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NuskInvoice {
  id?: number;
  invoiceNumber?: string;
  groupName?: string;
  amount?: number;
  status?: string;
  issuedAt?: string;
}

export default function NuskInvoicesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NuskInvoice[]>('/api/umrah/nusk-invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فواتير النسك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير النسك' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد فواتير" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.groupName ?? item.invoiceNumber ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.invoiceNumber ? <Text style={{ fontSize: 12, color: c.brand }}>{item.invoiceNumber}</Text> : null}
            {item.amount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.text, marginTop: 4 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
