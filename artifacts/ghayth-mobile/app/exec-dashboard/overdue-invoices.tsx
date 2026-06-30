import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OverdueInvoice {
  invoiceId?: number;
  invoiceNumber?: string;
  clientName?: string;
  amount?: number;
  daysOverdue?: number;
  currency?: string;
}

export default function OverdueInvoicesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OverdueInvoice[]>('/api/exec-dashboard/overdue-invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفواتير المتأخرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفواتير المتأخرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.invoiceId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فواتير متأخرة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.clientName ?? '—'}
              </Text>
              <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>
                {item.amount != null ? Number(item.amount).toLocaleString('ar-SA') : '—'} {item.currency ?? 'ر.س'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.invoiceNumber ?? '—'}</Text>
              {item.daysOverdue != null ? (
                <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.daysOverdue} يوم تأخير</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
