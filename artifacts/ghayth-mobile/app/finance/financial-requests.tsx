/**
 * الطلبات المالية
 * GET /api/finance/financial-requests
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinancialRequest {
  id: number;
  requestNumber?: string;
  requestType?: string;
  requesterName?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FinancialRequestsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinancialRequest[]>('/api/finance/financial-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات المالية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الطلبات المالية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد طلبات مالية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.requestNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.requestNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.requesterName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.requestType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.requestType}</Text> : null}
              {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
