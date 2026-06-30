/**
 * طلبات الشراء
 * GET /api/finance/purchase-requests
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PurchaseRequest {
  id: number;
  requestNumber?: string;
  requesterName?: string;
  department?: string;
  estimatedAmount?: number;
  currency?: string;
  requestedDate?: string;
  neededBy?: string;
  status?: string;
  itemCount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PurchaseRequestsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PurchaseRequest[]>('/api/finance/purchase-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات الشراء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الشراء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cart-outline" title="لا توجد طلبات شراء" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/purchase-request-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.requestNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.requesterName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
              {item.itemCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.itemCount} صنف</Text> : null}
              {item.estimatedAmount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.estimatedAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
            {item.neededBy ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>مطلوب بحلول: {fmtDate(item.neededBy)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
