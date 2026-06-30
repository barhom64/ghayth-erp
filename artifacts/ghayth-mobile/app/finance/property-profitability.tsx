import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertyProfitability {
  propertyId?: number;
  propertyName?: string;
  revenue?: number;
  cost?: number;
  profit?: number;
  margin?: number;
  occupancyRate?: number;
}

export default function PropertyProfitabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PropertyProfitability[]>('/api/finance/reports/profitability/property/0');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ربحية العقارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربحية العقارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.propertyId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.propertyName ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: (item.profit ?? 0) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                {Number(item.profit ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>إيراد: {Number(item.revenue ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>تكلفة: {Number(item.cost ?? 0).toLocaleString('ar-SA')}</Text>
              {item.occupancyRate != null ? (
                <Text style={{ fontSize: 12, color: c.brand }}>إشغال: {Number(item.occupancyRate).toFixed(1)}%</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
