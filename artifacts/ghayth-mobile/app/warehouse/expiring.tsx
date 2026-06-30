import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpiringItem {
  id?: number;
  lotNumber?: string;
  productName?: string;
  warehouseId?: number;
  qty?: number;
  expiresAt?: string;
  daysLeft?: number;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function WarehouseExpiringScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpiringItem[]>('/api/reports/expiring');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الدُفعات المنتهية الصلاحية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دُفعات مشارفة على الانتهاء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد دُفعات منتهية قريبًا" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 30;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: urgent ? '#EF4444' : '#F59E0B', padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.productName ?? item.lotNumber ?? '—'}</Text>
                {item.daysLeft != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: urgent ? '#EF4444' : '#F59E0B' }}>{item.daysLeft} يوم</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.lotNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>دُفعة: {item.lotNumber}</Text> : null}
                {item.qty != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الكمية: {item.qty}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.expiresAt)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
