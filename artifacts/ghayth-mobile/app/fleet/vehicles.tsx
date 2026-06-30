/**
 * المركبات
 * GET /api/fleet/vehicles
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Vehicle {
  id: number;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  status?: string;
  driverName?: string;
  odometer?: number;
}

export default function VehiclesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Vehicle[]>('/api/fleet/vehicles');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المركبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المركبات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا توجد مركبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/vehicle-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.brand }}>{item.plateNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1, textAlign: 'right' }}>
                {[item.make, item.model, item.year].filter(Boolean).join(' ')}
              </Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.type ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type}</Text> : null}
              {item.color ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.color}</Text> : null}
              {item.driverName ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.driverName}</Text> : null}
            </View>
            {item.odometer != null ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{item.odometer.toLocaleString('ar-SA')} كم</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
