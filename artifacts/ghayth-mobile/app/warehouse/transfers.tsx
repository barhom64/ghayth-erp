/**
 * تحويلات المستودع
 * GET /api/warehouse/transfers
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WarehouseTransfer {
  id: number;
  transferNumber?: string;
  fromWarehouse?: string;
  toWarehouse?: string;
  itemCount?: number;
  requestedBy?: string;
  requestedAt?: string;
  completedAt?: string;
  status?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function WarehouseTransfersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WarehouseTransfer[]>('/api/warehouse/transfers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التحويلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحويلات المستودع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد تحويلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.transferNumber ? <Text style={{ fontSize: 12, color: c.brand }}>#{item.transferNumber}</Text> : null}
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.fromWarehouse ?? '—'}</Text>
              <Text style={{ fontSize: 14, color: c.brand }}>←</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.toWarehouse ?? '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.itemCount != null ? <Text style={{ fontSize: 12, color: c.text }}>{item.itemCount} صنف</Text> : null}
              {item.requestedBy ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.requestedBy}</Text> : null}
              {item.requestedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.requestedAt)}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
