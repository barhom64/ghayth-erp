import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LotExpiryAlert {
  lotId?: number;
  lotNumber?: string;
  productName?: string;
  warehouseName?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  quantity?: number;
}

export default function LotExpiryAlertsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LotExpiryAlert[]>('/api/finance/reports/lot-expiry-alerts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تنبيهات انتهاء الدفعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const urgencyColor = (days?: number) => {
    if (days == null) return '#9CA3AF';
    if (days <= 7) return '#EF4444';
    if (days <= 30) return '#F59E0B';
    return '#22C55E';
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات انتهاء صلاحية الدفعات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.lotId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد دفعات قاربت على الانتهاء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.productName ?? '—'}
              </Text>
              {item.daysUntilExpiry != null ? (
                <Text style={{ fontSize: 12, color: urgencyColor(item.daysUntilExpiry), fontWeight: '600' }}>
                  {item.daysUntilExpiry} يوم
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
              {item.lotNumber ?? '—'} — {item.warehouseName ?? '—'}
            </Text>
            {item.quantity != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                الكمية: {item.quantity}
              </Text>
            ) : null}
            {item.expiryDate ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.expiryDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
