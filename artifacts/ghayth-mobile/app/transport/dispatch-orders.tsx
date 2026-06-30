/**
 * أوامر التوزيع
 * GET /api/transport/dispatch-orders
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DispatchOrder {
  id: number;
  orderNumber?: string;
  driverName?: string;
  vehiclePlate?: string;
  origin?: string;
  destination?: string;
  scheduledAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function DispatchOrdersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<DispatchOrder[]>('/api/transport/dispatch-orders');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أوامر التوزيع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أوامر التوزيع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="compass-outline" title="لا توجد أوامر توزيع" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/transport/dispatch-order-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.orderNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.orderNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.vehiclePlate ? <Text style={{ fontSize: 12, color: c.brand }}>{item.vehiclePlate}</Text> : null}
              {item.origin ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.origin}</Text> : null}
              {item.destination ? <Text style={{ fontSize: 12, color: c.textMuted }}>← {item.destination}</Text> : null}
            </View>
            {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.scheduledAt)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
