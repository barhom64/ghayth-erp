/**
 * أوامر الشراء
 * GET /api/finance/purchase-orders
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinancePurchaseOrder {
  id: number;
  poNumber?: string;
  vendorName?: string;
  totalAmount?: number;
  currency?: string;
  orderDate?: string;
  expectedDelivery?: string;
  status?: string;
  itemCount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FinancePurchaseOrdersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FinancePurchaseOrder[]>('/api/finance/purchase-orders');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أوامر الشراء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أوامر الشراء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="clipboard-outline" title="لا توجد أوامر شراء" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/purchase-order-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.poNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.vendorName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.itemCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.itemCount} صنف</Text> : null}
              {item.totalAmount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.orderDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.orderDate)}</Text> : null}
              {item.expectedDelivery ? <Text style={{ fontSize: 11, color: c.textFaint }}>تسليم: {fmtDate(item.expectedDelivery)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
