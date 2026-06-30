import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OverdueInvoice {
  id?: number;
  invoiceNumber?: string;
  clientName?: string;
  amount?: number;
  currency?: string;
  daysOverdue?: number;
  dueDate?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
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
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فواتير متأخرة" description="" />}
        renderItem={({ item }) => {
          const overdue = item.daysOverdue ?? 0;
          const borderColor = overdue > 90 ? '#EF4444' : overdue > 30 ? '#F59E0B' : '#3B82F6';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: borderColor, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.clientName ?? '—'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: borderColor }}>{overdue} يوم</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.amount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {item.invoiceNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.invoiceNumber}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textFaint }}>استحقاق: {fmtDate(item.dueDate)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
