import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TelematicsDevice {
  id: number;
  imei?: string;
  deviceModel?: string;
  vehiclePlate?: string;
  status?: string;
  lastSeen?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TelematicsDevicesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TelematicsDevice[]>('/api/telematics/devices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أجهزة التتبع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أجهزة التتبع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="hardware-chip-outline" title="لا توجد أجهزة تتبع" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand, flex: 1, textAlign: 'right' }}>{item.imei ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.deviceModel ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.deviceModel}</Text> : null}
              {item.vehiclePlate ? <Text style={{ fontSize: 12, color: c.text }}>{item.vehiclePlate}</Text> : null}
              {item.lastSeen ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.lastSeen)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
