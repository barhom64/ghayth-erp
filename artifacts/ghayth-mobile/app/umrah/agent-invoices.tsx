/**
 * فواتير الوكلاء - العمرة
 * GET /api/umrah/agent-invoices
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AgentInvoice {
  id: number;
  invoiceNumber?: string;
  agentName?: string;
  amount?: number;
  paidAmount?: number;
  currency?: string;
  status?: string;
  dueDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function AgentInvoicesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AgentInvoice[]>('/api/umrah/agent-invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فواتير الوكلاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير وكلاء العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد فواتير" description="" />}
        renderItem={({ item }) => {
          const remaining = item.amount != null && item.paidAmount != null ? item.amount - item.paidAmount : null;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.invoiceNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.invoiceNumber}</Text> : null}
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.agentName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.amount != null ? <Text style={{ fontSize: 12, color: c.text }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {item.dueDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>الاستحقاق: {fmtDate(item.dueDate)}</Text> : null}
              </View>
              {remaining != null && remaining > 0 ? (
                <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'right', marginTop: 4 }}>
                  متبقٍّ: {remaining.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
