/**
 * الذمم المدينة
 * GET /api/finance/receivables
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Receivable {
  id: number;
  clientName?: string;
  invoiceNumber?: string;
  amount?: number;
  paidAmount?: number;
  currency?: string;
  dueDate?: string;
  status?: string;
  daysOverdue?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ReceivablesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Receivable[]>('/api/finance/receivables');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الذمم المدينة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الذمم المدينة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="card-outline" title="لا توجد ذمم مدينة" description="" />}
        renderItem={({ item }) => {
          const remaining = item.amount != null && item.paidAmount != null ? item.amount - item.paidAmount : null;
          const overdue = item.daysOverdue != null && item.daysOverdue > 0;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: overdue ? '#FEE2E2' : c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.invoiceNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.invoiceNumber}</Text> : null}
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.clientName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {remaining != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>
                    {remaining.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                  </Text>
                ) : null}
                {item.dueDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>استحقاق: {fmtDate(item.dueDate)}</Text> : null}
                {overdue ? <Text style={{ fontSize: 11, color: '#EF4444' }}>متأخر {item.daysOverdue} يوم</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
