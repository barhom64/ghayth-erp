/**
 * تفاصيل طلب المتجر
 * GET /api/store/orders/:id
 */
import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface OrderItem {
  id: number;
  productName?: string;
  quantity?: number;
  price?: number;
  total?: number;
}

interface StoreOrder {
  id: number;
  orderNumber?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  status?: string;
  total?: number;
  tax?: number;
  discount?: number;
  shippingAddress?: string;
  notes?: string;
  createdAt?: string;
  items?: OrderItem[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'مُسلَّم',
  cancelled: 'ملغي',
  returned: 'مُرجَّع',
};

export default function StoreOrderDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const endpoint = `/api/store/orders/${id}`;
  const { data, isLoading, isError } = useList<StoreOrder>(endpoint);
  const { refreshing, onRefresh } = useRefresh([[endpoint]]);
  const order = Array.isArray(data) ? data[0] : data as StoreOrder | null;

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError || !order) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={onRefresh} />
  );

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: order.orderNumber ?? 'الطلب' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>{order.orderNumber ?? `#${order.id}`}</Text>
            <GStatusBadge status={order.status ?? ''} />
          </View>
          <Text style={{ fontSize: 14, color: c.text, textAlign: 'right' }}>{order.clientName ?? '—'}</Text>
          {order.clientPhone ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{order.clientPhone}</Text> : null}
          {order.shippingAddress ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{order.shippingAddress}</Text> : null}
        </GCard>

        {items.length > 0 && (
          <GCard style={{ padding: 0, gap: 0 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>المنتجات</Text>
            </View>
            {items.map((item: OrderItem, i: number) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 12, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>
                    {item.quantity ?? 0} × {item.price ?? 0} ر.س
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.total ?? 0} ر.س</Text>
              </View>
            ))}
          </GCard>
        )}

        <GCard>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الملخص المالي</Text>
          {[
            { label: 'المجموع', value: order.total != null ? `${order.total} ر.س` : null },
            { label: 'الضريبة', value: order.tax != null ? `${order.tax} ر.س` : null },
            { label: 'الخصم', value: order.discount != null ? `${order.discount} ر.س` : null },
          ].filter(r => r.value).map(row => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{row.value}</Text>
            </View>
          ))}
        </GCard>

        {order.notes ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>ملاحظات</Text>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{order.notes}</Text>
          </GCard>
        ) : null}
      </ScrollView>
    </View>
  );
}
