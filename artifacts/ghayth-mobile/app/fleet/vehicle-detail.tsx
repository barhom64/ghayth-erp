/**
 * تفاصيل المركبة — معلومات + الرحلات + الصيانة + المخالفات
 * GET /api/fleet/vehicles/:id
 * GET /api/fleet/vehicles/:id/trips?pageSize=10
 * GET /api/fleet/vehicles/:id/maintenance?pageSize=10
 * GET /api/fleet/vehicles/:id/violations?pageSize=10
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'trips' | 'maintenance' | 'violations';

interface Vehicle {
  id: number;
  plateNumber?: string;
  name?: string;
  model?: string;
  make?: string;
  year?: number;
  color?: string;
  status?: string;
  driverName?: string;
  type?: string;
  vin?: string;
  insuranceExpiry?: string;
  registrationExpiry?: string;
  lastOdometer?: number;
  fuelType?: string;
  companyName?: string;
}

interface Trip {
  id: number;
  startTime?: string;
  endTime?: string;
  distance?: number;
  status?: string;
  driverName?: string;
  from?: string;
  to?: string;
  purpose?: string;
}

interface VehicleMaintenance {
  id: number;
  type?: string;
  date?: string;
  odometer?: number;
  cost?: number;
  status?: string;
  description?: string;
  nextDue?: string;
}

interface Violation {
  id: number;
  type?: string;
  date?: string;
  fine?: number;
  status?: string;
  description?: string;
  driverName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

export default function VehicleDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const router = useRouter();
  const { data: vehicle, isLoading: vehLoading } = useList<Vehicle>(`/api/fleet/vehicles/${id}`);
  const { data: tripsResp, isLoading: tripsLoading } = useList<{ data?: Trip[] }>(
    `/api/fleet/vehicles/${id}/trips`, { pageSize: 10 }, { enabled: tab === 'trips' }
  );
  const { data: maintResp, isLoading: maintLoading } = useList<{ data?: VehicleMaintenance[] }>(
    `/api/fleet/vehicles/${id}/maintenance`, { pageSize: 10 }, { enabled: tab === 'maintenance' }
  );
  const { data: violResp, isLoading: violLoading } = useList<{ data?: Violation[] }>(
    `/api/fleet/vehicles/${id}/violations`, { pageSize: 10 }, { enabled: tab === 'violations' }
  );

  if (vehLoading) return <GLoadingState text="جارٍ تحميل المركبة…" />;
  if (!vehicle) return <GEmptyState icon="car-outline" title="مركبة غير موجودة" description="تعذّر العثور على بيانات المركبة" />;

  const name = vehicle.plateNumber ? `${vehicle.plateNumber} — ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : (vehicle.name ?? '—');
  const st = statusBadge(vehicle.status ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'information-circle-outline' },
    { key: 'trips', label: 'الرحلات', icon: 'navigate-outline' },
    { key: 'maintenance', label: 'الصيانة', icon: 'build-outline' },
    { key: 'violations', label: 'المخالفات', icon: 'warning-outline' },
  ];

  const trips = tripsResp?.data ?? [];
  const maintenance = maintResp?.data ?? [];
  const violations = violResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: vehicle.plateNumber ?? 'المركبة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <Ionicons name="car" size={48} color={c.onPrimary + '80'} />
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {vehicle.driverName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>السائق: {vehicle.driverName}</Text> : null}
          {vehicle.companyName ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{vehicle.companyName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'الماركة', value: vehicle.make },
              { label: 'الموديل', value: vehicle.model },
              { label: 'السنة', value: vehicle.year !== undefined ? String(vehicle.year) : undefined },
              { label: 'اللون', value: vehicle.color },
              { label: 'النوع', value: vehicle.type },
              { label: 'نوع الوقود', value: vehicle.fuelType },
              { label: 'رقم الهيكل', value: vehicle.vin },
              { label: 'آخر عداد', value: vehicle.lastOdometer !== undefined ? `${vehicle.lastOdometer.toLocaleString('ar-SA')} كم` : undefined },
              { label: 'انتهاء التأمين', value: fmtDate(vehicle.insuranceExpiry) },
              { label: 'انتهاء الترخيص', value: fmtDate(vehicle.registrationExpiry) },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 100, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'info' && (
          <GButton
            title="تسجيل مصروف وقود"
            icon="water-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/fleet/fuel-log-new' as never, params: { vehicleId: id } })}
            style={{ marginTop: 8 }}
          />
        )}

        {tab === 'trips' && (
          <>
          <GButton
            title="حجز رحلة جديدة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/fleet/trip-new' as never, params: { vehicleId: id } })}
            style={{ marginBottom: 8 }}
          />
          {tripsLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          trips.length === 0 ? <GEmptyState icon="compass-outline" title="لا رحلات" description="لا توجد رحلات مسجّلة لهذه المركبة" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {trips.map((trip, i) => {
              const st = statusBadge(trip.status ?? '');
              return (
                <View key={trip.id} style={[styles.listRow, { borderBottomColor: c.border }, i === trips.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>
                      {trip.from ?? '—'} → {trip.to ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(trip.startTime)}{trip.distance !== undefined ? ` · ${trip.distance} كم` : ''}{trip.driverName ? ` · ${trip.driverName}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {tab === 'maintenance' && (
          <>
          <GButton
            title="أمر صيانة جديد"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/fleet/maintenance-new' as never, params: { vehicleId: id } })}
            style={{ marginBottom: 8 }}
          />
          {maintLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          maintenance.length === 0 ? <GEmptyState icon="build-outline" title="لا صيانة" description="لا توجد سجلات صيانة لهذه المركبة" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {maintenance.map((m, i) => {
              const st = statusBadge(m.status ?? '');
              return (
                <View key={m.id} style={[styles.listRow, { borderBottomColor: c.border }, i === maintenance.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{m.type ?? m.description ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(m.date)}{m.cost !== undefined ? ` · ${fmtMoney(m.cost)}` : ''}{m.odometer !== undefined ? ` · ${m.odometer.toLocaleString('ar-SA')} كم` : ''}
                    </Text>
                    {m.nextDue ? <Text style={{ fontSize: 12, color: '#3B82F6', textAlign: 'right' }}>الموعد القادم: {fmtDate(m.nextDue)}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {tab === 'violations' && (
          violLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          violations.length === 0 ? <GEmptyState icon="warning-outline" title="لا مخالفات" description="لا توجد مخالفات مسجّلة لهذه المركبة" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {violations.map((v, i) => {
              const st = statusBadge(v.status ?? '');
              return (
                <View key={v.id} style={[styles.listRow, { borderBottomColor: c.border }, i === violations.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{v.type ?? v.description ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(v.date)}{v.fine !== undefined ? ` · ${fmtMoney(v.fine)}` : ''}{v.driverName ? ` · ${v.driverName}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, gap: 12 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
