/**
 * ملف السائق — معلومات + رحلات + مخالفات
 * GET /api/fleet/drivers/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Driver {
  id: number;
  name?: string;
  employeeNumber?: string;
  phone?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  idNumber?: string;
  nationality?: string;
  status?: string;
  assignedVehicle?: string;
  vehicleNumber?: string;
  totalTrips?: number;
  totalKm?: number;
  activeViolations?: number;
  rating?: number;
  joinDate?: string;
}

interface Trip {
  id?: number;
  ref?: string;
  destination?: string;
  startDate?: string;
  distanceKm?: number;
  status?: string;
}

interface Violation {
  id?: number;
  type?: string;
  date?: string;
  fineAmount?: number;
  status?: string;
}

type Tab = 'info' | 'trips' | 'violations';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function DriverDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: driver, isLoading } = useList<Driver>(`/api/fleet/drivers/${id}`);
  const { data: tripsData } = useList<Trip[]>(`/api/fleet/trips?driverId=${id}`, undefined, { enabled: tab === 'trips' });
  const { data: violationsData } = useList<Violation[]>(`/api/fleet/traffic-violations?driverId=${id}`, undefined, { enabled: tab === 'violations' });

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملف السائق…" />;
  if (!driver) return <GEmptyState icon="person-outline" title="سائق غير موجود" description="تعذّر العثور على بيانات السائق" />;

  const name = driver.name ?? `سائق #${driver.id}`;
  const st = statusBadge(driver.status ?? '');
  const trips = Array.isArray(tripsData) ? tripsData : [];
  const violations = Array.isArray(violationsData) ? violationsData : [];

  const isExpiring = driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date(Date.now() + 60 * 24 * 3600 * 1000);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'trips', label: 'الرحلات' },
    { key: 'violations', label: 'المخالفات' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <GAvatar name={name} size="lg" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {driver.employeeNumber ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>#{driver.employeeNumber}</Text> : null}
          {driver.assignedVehicle ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{driver.assignedVehicle} {driver.vehicleNumber ? `(${driver.vehicleNumber})` : ''}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {/* KPIs */}
      <View style={[styles.kpiRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.kpiItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{driver.totalTrips ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>رحلة</Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: c.border }]} />
        <View style={styles.kpiItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{driver.totalKm ? `${driver.totalKm.toLocaleString('ar-SA')} كم` : '—'}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>إجمالي المسافة</Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: c.border }]} />
        <View style={styles.kpiItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: (driver.activeViolations ?? 0) > 0 ? '#EF4444' : c.text }}>{driver.activeViolations ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>مخالفات نشطة</Text>
        </View>
      </View>

      {/* تحذير انتهاء الرخصة */}
      {isExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>رخصة القيادة تنتهي في {fmtDate(driver.licenseExpiry)}</Text>
        </View>
      )}

      {/* التبويبات */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'رقم الهوية', value: driver.idNumber },
              { label: 'الجنسية', value: driver.nationality },
              { label: 'الهاتف', value: driver.phone },
              { label: 'رقم رخصة القيادة', value: driver.licenseNumber },
              { label: 'تاريخ انتهاء الرخصة', value: fmtDate(driver.licenseExpiry) },
              { label: 'تاريخ الالتحاق', value: fmtDate(driver.joinDate) },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'trips' && (
          trips.length === 0
            ? <GEmptyState icon="car-outline" title="لا توجد رحلات" description="لم يتم تسجيل أي رحلات لهذا السائق" />
            : trips.map((trip, i) => (
              <GCard key={trip.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{trip.distanceKm ? `${trip.distanceKm} كم` : '—'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{trip.destination ?? trip.ref ?? '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(trip.startDate)}</Text>
                  {trip.status ? <GStatusBadge status={trip.status} size="sm" /> : null}
                </View>
              </GCard>
            ))
        )}

        {tab === 'violations' && (
          violations.length === 0
            ? <GEmptyState icon="checkmark-circle-outline" title="لا توجد مخالفات" description="لا توجد مخالفات مسجّلة لهذا السائق" />
            : violations.map((v, i) => (
              <GCard key={v.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{v.fineAmount ? `${v.fineAmount} ر.س` : '—'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{v.type ?? '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(v.date)}</Text>
                  {v.status ? <GStatusBadge status={v.status} size="sm" /> : null}
                </View>
              </GCard>
            ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  kpiRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, marginVertical: 4 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
