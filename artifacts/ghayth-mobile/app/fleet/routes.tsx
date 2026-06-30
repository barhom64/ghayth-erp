/**
 * مسارات الأسطول
 * GET /api/fleet/routes
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetRoute {
  id: number;
  name?: string;
  origin?: string;
  destination?: string;
  waypoints?: number;
  distanceKm?: number;
  estimatedMinutes?: number;
  vehicleType?: string;
  status?: string;
  tripsCount?: number;
}

export default function FleetRoutesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetRoute[]>('/api/fleet/routes');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المسارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مسارات الأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد مسارات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' }} />
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.origin ?? '—'}</Text>
            </View>
            {item.waypoints ? (
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="ellipsis-vertical-outline" size={12} color={c.textFaint} />
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.waypoints} نقطة توقف</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.destination ?? '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.distanceKm != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.distanceKm} كم</Text>
              ) : null}
              {item.estimatedMinutes != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.estimatedMinutes} دقيقة</Text>
              ) : null}
              {item.vehicleType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.vehicleType}</Text> : null}
              {item.tripsCount != null ? (
                <Text style={{ fontSize: 12, color: c.textFaint }}>{item.tripsCount} رحلة</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
