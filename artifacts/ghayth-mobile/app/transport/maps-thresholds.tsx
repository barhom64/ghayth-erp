import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MapsThreshold {
  id?: number | string;
  label?: string;
  value?: number;
  unit?: string;
}

export default function TransportMapsThresholdsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MapsThreshold[]>('/api/transport/maps-usage/thresholds');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حدود استخدام الخرائط…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حدود استخدام الخرائط' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="map-outline" title="لا توجد حدود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: c.text }}>{item.label ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                {item.value != null ? `${item.value.toLocaleString('ar-SA')} ${item.unit ?? ''}` : '—'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
