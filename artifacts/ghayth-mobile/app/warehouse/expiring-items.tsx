import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpiringItem {
  id?: number;
  productName?: string;
  lotNumber?: string;
  quantity?: number;
  expiryDate?: string;
  daysLeft?: number;
  warehouse?: string;
}

export default function WarehouseExpiringItemsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpiringItem[]>('/api/warehouse/reports/expiring');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل البنود المنتهية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'البنود المنتهية الصلاحية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد بنود منتهية" description="" />}
        renderItem={({ item }) => {
          const urgentColor = (item.daysLeft ?? 999) <= 7 ? '#EF4444' : (item.daysLeft ?? 999) <= 30 ? '#F59E0B' : '#22C55E';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, borderRightWidth: 3, borderRightColor: urgentColor }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.productName ?? '—'}</Text>
                {item.daysLeft != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: urgentColor }}>{item.daysLeft} يوم</Text>
                ) : null}
              </View>
              {item.lotNumber ? <Text style={{ fontSize: 12, color: c.textMuted }}>دفعة: {item.lotNumber}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.quantity != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.quantity} وحدة</Text> : null}
                {item.warehouse ? <Text style={{ fontSize: 12, color: c.brand }}>{item.warehouse}</Text> : null}
              </View>
              {item.expiryDate ? (
                <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                  ينتهي: {new Date(item.expiryDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
