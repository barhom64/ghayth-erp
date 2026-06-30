import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PendingGrn {
  id?: number;
  poNumber?: string;
  vendorName?: string;
  expectedDate?: string;
  totalAmount?: number;
  currency?: string;
  itemCount?: number;
}

export default function FinancePendingGrnScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PendingGrn[]>('/api/finance/purchase-orders/pending-grn');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات المعلّقة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أوامر الشراء المعلّقة الاستلام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد طلبات معلّقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.poNumber ?? '—'}</Text>
              {item.totalAmount != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                  {item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              )}
            </View>
            {item.vendorName ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vendorName}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.expectedDate ? (
                <Text style={{ fontSize: 11, color: c.textMuted }}>
                  {new Date(item.expectedDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
              {item.itemCount != null ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.itemCount} صنف</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
