/**
 * أوامر الشراء — المستودع
 * GET /api/warehouse/purchase-orders
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WarehousePO {
  id: number;
  poNumber?: string;
  supplierName?: string;
  totalAmount?: number;
  currency?: string;
  itemCount?: number;
  status?: string;
  expectedDelivery?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function WarehousePurchaseOrdersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<WarehousePO[]>('/api/warehouse/purchase-orders');
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
        ListEmptyComponent={<GEmptyState icon="cart-outline" title="لا توجد أوامر شراء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.poNumber ? <Text style={{ fontSize: 12, color: c.brand }}>#{item.poNumber}</Text> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.supplierName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.totalAmount != null ? (
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                  {item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              ) : null}
              {item.itemCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.itemCount} صنف</Text> : null}
              {item.expectedDelivery ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>التسليم: {fmtDate(item.expectedDelivery)}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
