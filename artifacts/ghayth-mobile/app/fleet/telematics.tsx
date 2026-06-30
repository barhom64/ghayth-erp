/**
 * بيانات التتبع والتليماتيك
 * GET /api/fleet/telematics
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VehicleTelematics {
  id: number;
  vehiclePlate?: string;
  vehicleModel?: string;
  driverName?: string;
  speed?: number;
  fuelLevel?: number;
  engineTemp?: number;
  odometer?: number;
  lastLocation?: string;
  status?: 'moving' | 'idle' | 'stopped' | 'offline';
  lastUpdated?: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  moving: { color: '#22C55E', label: 'في الحركة', icon: 'navigate-outline' },
  idle: { color: '#F59E0B', label: 'خامل', icon: 'pause-circle-outline' },
  stopped: { color: '#94A3B8', label: 'متوقف', icon: 'stop-circle-outline' },
  offline: { color: '#EF4444', label: 'غير متصل', icon: 'cloud-offline-outline' },
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function FleetTelematicsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VehicleTelematics[]>('/api/fleet/telematics');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات التتبع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التتبع والتليماتيك' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="locate-outline" title="لا توجد بيانات تتبع" description="" />}
        renderItem={({ item }) => {
          const st = STATUS_CONFIG[item.status ?? 'offline'] ?? STATUS_CONFIG.offline;
          return (
            <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: st.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={st.icon as never} size={18} color={st.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.vehiclePlate ?? '—'}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.vehicleModel ?? ''}</Text>
                </View>
                <View style={{ backgroundColor: st.color + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, color: st.color, fontWeight: '600' }}>{st.label}</Text>
                </View>
              </View>
              {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 8 }}>السائق: {item.driverName}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
                {item.speed != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.speed}</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>كم/س</Text>
                  </View>
                ) : null}
                {item.fuelLevel != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: item.fuelLevel < 20 ? '#EF4444' : c.text }}>{item.fuelLevel}%</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>الوقود</Text>
                  </View>
                ) : null}
                {item.odometer != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.odometer.toLocaleString('ar-SA')}</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>كم</Text>
                  </View>
                ) : null}
              </View>
              {item.lastLocation ? (
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 8 }}>
                  📍 {item.lastLocation} — {fmtDate(item.lastUpdated)}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
