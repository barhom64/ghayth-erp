import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PackageDrift {
  id?: number;
  packageName?: string;
  allocatedPrice?: number;
  currentPrice?: number;
  drift?: number;
  driftPct?: number;
}

export default function UmrahPackagesDriftScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PackageDrift[]>('/api/umrah/reports/packages-vs-allocations-pricing-drift');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير انحراف الأسعار…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'انحراف أسعار الباقات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="analytics-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const isPositive = (item.drift ?? 0) >= 0;
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.packageName ?? '—'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isPositive ? '#EF4444' : '#22C55E' }}>
                  {isPositive ? '+' : ''}{(item.drift ?? 0).toLocaleString('ar-SA')} ر.س
                </Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>مخصص: {(item.allocatedPrice ?? 0).toLocaleString('ar-SA')}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>حالي: {(item.currentPrice ?? 0).toLocaleString('ar-SA')}</Text>
              </View>
              {item.driftPct != null ? (
                <Text style={{ fontSize: 11, color: isPositive ? '#EF4444' : '#22C55E', marginTop: 2 }}>
                  {isPositive ? '+' : ''}{item.driftPct}%
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
