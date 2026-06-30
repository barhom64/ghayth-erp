/**
 * إدارة الإطارات
 * GET /api/fleet/tires
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetTire {
  id: number;
  vehiclePlate?: string;
  serialNumber?: string;
  brand?: string;
  position?: string;
  installKm?: number;
  currentKm?: number;
  maxKm?: number;
  status?: string;
}

export default function TiresScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetTire[]>('/api/fleet/tires');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإطارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إدارة الإطارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="ellipse-outline" title="لا توجد إطارات" description="" />}
        renderItem={({ item }) => {
          const pct = item.maxKm && item.currentKm && item.installKm
            ? Math.min(100, Math.round(((item.currentKm - item.installKm) / item.maxKm) * 100))
            : null;
          const barColor = pct == null ? '#94A3B8' : pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#22C55E';
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, flex: 1, textAlign: 'right' }}>{item.brand ?? ''} {item.position ?? ''}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {pct != null ? (
                <View style={{ height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 4 }}>
                  <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: barColor, borderRadius: 2 }} />
                </View>
              ) : null}
              {item.serialNumber ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{item.serialNumber}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
