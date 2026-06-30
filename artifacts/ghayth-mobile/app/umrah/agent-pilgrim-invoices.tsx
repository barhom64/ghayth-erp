import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AgentInvoice {
  id?: number;
  invoiceNumber?: string;
  amount?: number;
  status?: string;
  dueDate?: string;
  pilgrimsCount?: number;
}

export default function AgentPilgrimInvoicesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AgentInvoice[]>('/api/umrah/agents/0/invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فواتير الوكيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير وكيل العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد فواتير" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.invoiceNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                {Number(item.amount ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {item.dueDate ? new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.pilgrimsCount != null ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>معتمرون: {item.pilgrimsCount}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
