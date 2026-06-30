/**
 * طلبات المتجر
 * GET /api/store/orders
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StoreOrder {
  id: number;
  orderNumber?: string;
  clientName?: string;
  status?: string;
  total?: number;
  itemCount?: number;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'مُسلَّم',
  cancelled: 'ملغي',
  returned: 'مُرجَّع',
};

export default function StoreOrdersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<StoreOrder[]>('/api/store/orders');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات المتجر' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/store/order-detail' as never, params: { id: item.id } })}
            style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.orderNumber ?? `#${item.id}`}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{item.clientName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.total != null && <Text style={{ fontSize: 13, fontWeight: '600', color: c.brand }}>{item.total} ر.س</Text>}
                {item.itemCount != null && <Text style={{ fontSize: 11, color: c.textMuted }}>{item.itemCount} منتج</Text>}
                {item.createdAt && <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text>}
              </View>
            </View>
            <Ionicons name="chevron-back-outline" size={16} color={c.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
