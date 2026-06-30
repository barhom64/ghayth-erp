/**
 * الموافقات المالية
 * GET /api/finance/approvals
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface FinanceApproval {
  id: number;
  type?: string;
  description?: string;
  amount?: number;
  currency?: string;
  requestedBy?: string;
  requestedAt?: string;
  status?: string;
  referenceNumber?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FinanceApprovalsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<FinanceApproval[]>('/api/finance/approvals');
  const list = Array.isArray(data) ? data : [];

  async function approve(id: number) {
    await apiFetch(`/api/finance/approvals/${id}/approve`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/finance/approvals'] });
  }

  async function reject(id: number) {
    await apiFetch(`/api/finance/approvals/${id}/reject`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/finance/approvals'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الموافقات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الموافقات المالية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد موافقات معلقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                {item.type ?? '—'}{item.referenceNumber ? ` #${item.referenceNumber}` : ''}
              </Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.description ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 8 }}>
              {item.amount != null ? (
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                  {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              ) : null}
              {item.requestedBy ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.requestedBy}</Text> : null}
              {item.requestedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.requestedAt)}</Text> : null}
            </View>
            {item.status === 'pending' ? (
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                <GButton title="موافقة" variant="primary" size="sm" onPress={() => approve(item.id)} />
                <GButton title="رفض" variant="secondary" size="sm" onPress={() => reject(item.id)} />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
