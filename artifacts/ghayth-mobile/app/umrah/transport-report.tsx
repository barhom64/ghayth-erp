import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportReportRow {
  id?: number;
  groupName?: string;
  vehicleType?: string;
  tripsCount?: number;
  totalCost?: number;
  pilgrims?: number;
  route?: string;
}

export default function UmrahTransportReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TransportReportRow[]>('/api/umrah/reports/umrah-transport');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير النقل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير نقل الحجاج' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bus-outline" title="لا توجد بيانات نقل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.groupName ?? '—'}</Text>
              {item.tripsCount != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.tripsCount} رحلة</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              {item.vehicleType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.vehicleType}</Text> : null}
              {item.pilgrims != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.pilgrims} حاج</Text> : null}
            </View>
            {item.totalCost != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.text, marginTop: 4 }}>{item.totalCost.toLocaleString('ar-SA')} ر.س</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
