import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertyOccupancy {
  propertyId?: number;
  propertyName?: string;
  totalUnits?: number;
  occupiedUnits?: number;
  occupancyRate?: number;
  monthlyRevenue?: number;
  location?: string;
}

export default function PropertyOccupancyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PropertyOccupancy[]>('/api/bi/reports/property-occupancy');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إشغال الأملاك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إشغال الأملاك' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.propertyId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="home-outline" title="لا توجد أملاك" description="" />}
        renderItem={({ item }) => {
          const rate = item.occupancyRate ?? 0;
          const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.propertyName ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: rateColor }}>{rate}%</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
                {item.location ? <Text style={{ fontSize: 11, color: c.brand }}>{item.location}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textMuted }}>{item.occupiedUnits ?? 0}/{item.totalUnits ?? 0} وحدة</Text>
                {item.monthlyRevenue != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>{item.monthlyRevenue.toLocaleString('ar-SA')} ر.س</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
