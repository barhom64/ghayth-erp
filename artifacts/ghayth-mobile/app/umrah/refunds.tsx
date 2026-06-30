/**
 * طلبات استرداد العمرة
 * GET /api/umrah/refund-requests
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface RefundRequest {
  id: number;
  pilgrimName?: string;
  amount?: number;
  reason?: string;
  status?: string;
  createdAt?: string;
  currency?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  paid: 'مدفوع',
  closed: 'مغلق',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function UmrahRefundsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<RefundRequest[]>('/api/umrah/refund-requests');
  const list = Array.isArray(data) ? data : [];

  async function action(id: number, act: 'approve' | 'reject' | 'pay' | 'close') {
    await apiFetch(`/api/umrah/refund-requests/${id}/${act}`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/umrah/refund-requests'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الاستردادات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الاسترداد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="return-down-back-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.pilgrimName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.amount != null && (
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.brand, textAlign: 'right' }}>
                {item.amount} {item.currency ?? 'ر.س'}
              </Text>
            )}
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{item.reason}</Text> : null}
            {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.createdAt)}</Text> : null}
            {item.status === 'pending' && (
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10 }}>
                <GButton title="اعتماد" variant="primary" size="sm" onPress={() => action(item.id, 'approve')} />
                <GButton title="رفض" variant="secondary" size="sm" onPress={() => action(item.id, 'reject')} />
              </View>
            )}
            {item.status === 'approved' && (
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10 }}>
                <GButton title="صرف" variant="primary" size="sm" onPress={() => action(item.id, 'pay')} />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1 },
});
