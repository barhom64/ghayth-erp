import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MyCargoManifest {
  id?: number;
  status?: string;
  linkedCustomerName?: string;
  vehiclePlate?: string;
  totalWeight?: number;
  createdAt?: string;
}

export default function MeCargoScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MyCargoManifest[]>('/api/fleet/me/cargo');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بضائعي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusLabel = (s?: string) => {
    if (s === 'delivered') return 'مسلّمة';
    if (s === 'in_transit') return 'في الطريق';
    if (s === 'assigned') return 'مُسندة';
    return s ?? '—';
  };
  const statusColor = (s?: string) => s === 'delivered' ? '#22C55E' : s === 'in_transit' ? '#3B82F6' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بضائعي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد بوالص شحن" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.linkedCustomerName ?? `بوليصة #${item.id ?? '—'}`}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{statusLabel(item.status)}</Text>
            </View>
            {item.vehiclePlate ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vehiclePlate}</Text>
            ) : null}
            {item.totalWeight != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                الوزن: {item.totalWeight} كجم
              </Text>
            ) : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
