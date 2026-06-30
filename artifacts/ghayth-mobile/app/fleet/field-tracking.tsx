/**
 * التتبع الميداني — موقع المركبات في الوقت الفعلي
 * GET /api/fleet/telematics/live
 */
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface LiveVehicle {
  vehicleId: number;
  plate?: string;
  driverName?: string;
  speed?: number;
  lat?: number;
  lng?: number;
  status?: string;
  lastSeen?: string;
  location?: string;
}

interface LiveResp { data?: LiveVehicle[]; vehicles?: LiveVehicle[] }

function fmtTime(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const STATUS_ICON: Record<string, { icon: IoniconName; color: string }> = {
  moving:  { icon: 'navigate-circle-outline', color: '#22C55E' },
  idle:    { icon: 'pause-circle-outline',    color: '#F59E0B' },
  stopped: { icon: 'stop-circle-outline',     color: '#EF4444' },
  offline: { icon: 'cloud-offline-outline',   color: '#9CA3AF' },
};

export default function FieldTrackingScreen() {
  const c = useColors();
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = async () => {
    try {
      const data = await apiFetch('/api/fleet/telematics/live') as LiveResp;
      const list = data?.data ?? data?.vehicles ?? (Array.isArray(data) ? data : []);
      setVehicles(list as LiveVehicle[]);
      setLastRefresh(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const moving = vehicles.filter(v => v.status === 'moving').length;
  const idle = vehicles.filter(v => v.status === 'idle').length;

  if (loading) return <GLoadingState text="جارٍ تحميل بيانات التتبع…" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التتبع الميداني المباشر' }} />

      {/* إحصاء سريع */}
      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#22C55E' }}>{moving}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>متحركة</Text>
        </GCard>
        <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#F59E0B' }}>{idle}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>خاملة</Text>
        </GCard>
        <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.brand }}>{vehicles.length}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>إجمالي</Text>
        </GCard>
      </View>

      {lastRefresh ? (
        <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'center', marginBottom: 8 }}>آخر تحديث: {lastRefresh}</Text>
      ) : null}

      {vehicles.length === 0 ? (
        <GEmptyState icon="locate-outline" title="لا توجد بيانات" description="لم يتم استقبال بيانات تتبع بعد" />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={item => String(item.vehicleId)}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 8 }}
          renderItem={({ item }) => {
            const meta = STATUS_ICON[item.status ?? 'offline'] ?? STATUS_ICON.offline;
            return (
              <GCard style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'center' }}>
                <Ionicons name={meta.icon} size={28} color={meta.color} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtTime(item.lastSeen)}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{item.plate ?? `#${item.vehicleId}`}</Text>
                  </View>
                  {item.driverName ? <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>{item.driverName}</Text> : null}
                  {item.location ? <Text style={{ fontSize: 12, color: c.textFaint, textAlign: 'right' }}>{item.location}</Text> : null}
                  {item.speed !== undefined ? (
                    <Text style={{ fontSize: 12, color: meta.color, fontWeight: '600', textAlign: 'right' }}>{item.speed} كم/س</Text>
                  ) : null}
                </View>
              </GCard>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
