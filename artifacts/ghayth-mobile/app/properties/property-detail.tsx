/**
 * تفاصيل العقار — معلومات + الوحدات + العقود + صيانة
 * GET /api/properties/:id
 * GET /api/properties/:id/units?pageSize=10
 * GET /api/properties/:id/contracts?pageSize=10
 * GET /api/properties/:id/maintenance?pageSize=10
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'units' | 'contracts' | 'maintenance';

interface Property {
  id: number;
  name?: string;
  propertyName?: string;
  type?: string;
  status?: string;
  address?: string;
  city?: string;
  area?: number;
  floors?: number;
  unitsCount?: number;
  ownerName?: string;
  managedBy?: string;
  description?: string;
  yearBuilt?: number;
  monthlyRent?: number;
  totalRevenue?: number;
  occupancyRate?: number;
}

interface Unit {
  id: number;
  unitNumber?: string;
  number?: string;
  type?: string;
  area?: number;
  floor?: number | string;
  status?: string;
  tenantName?: string;
  rent?: number;
}

interface Contract {
  id: number;
  contractNumber?: string;
  tenantName?: string;
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  status?: string;
}

interface Maintenance {
  id: number;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  reportedAt?: string;
  scheduledDate?: string;
  type?: string;
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

export default function PropertyDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: property, isLoading: propLoading } = useList<Property>(`/api/properties/${id}`);
  const { data: unitsResp, isLoading: unitsLoading } = useList<{ data?: Unit[] }>(
    `/api/properties/${id}/units`, { pageSize: 10 }, { enabled: tab === 'units' }
  );
  const { data: contractsResp, isLoading: contrLoading } = useList<{ data?: Contract[] }>(
    `/api/properties/${id}/contracts`, { pageSize: 10 }, { enabled: tab === 'contracts' }
  );
  const { data: maintResp, isLoading: maintLoading } = useList<{ data?: Maintenance[] }>(
    `/api/properties/${id}/maintenance`, { pageSize: 10 }, { enabled: tab === 'maintenance' }
  );

  if (propLoading) return <GLoadingState text="جارٍ تحميل العقار…" />;
  if (!property) return <GEmptyState icon="home-outline" title="عقار غير موجود" description="تعذّر العثور على بيانات العقار" />;

  const name = property.name ?? property.propertyName ?? '—';
  const st = statusBadge(property.status ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'information-circle-outline' },
    { key: 'units', label: 'الوحدات', icon: 'grid-outline' },
    { key: 'contracts', label: 'العقود', icon: 'document-text-outline' },
    { key: 'maintenance', label: 'الصيانة', icon: 'build-outline' },
  ];

  const units = unitsResp?.data ?? [];
  const contracts = contractsResp?.data ?? [];
  const maintenance = maintResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {property.address ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{property.address}{property.city ? `، ${property.city}` : ''}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 6, gap: 8 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {property.occupancyRate !== undefined ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA' }}>إشغال {property.occupancyRate.toFixed(0)}%</Text> : null}
          </View>
        </View>
      </View>

      {/* KPI strip */}
      {(property.unitsCount !== undefined || property.totalRevenue !== undefined || property.monthlyRent !== undefined) && (
        <View style={[styles.kpiRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          {property.unitsCount !== undefined && (
            <View style={styles.kpiBox}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' }}>{property.unitsCount}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>وحدة</Text>
            </View>
          )}
          {property.monthlyRent !== undefined && (
            <View style={styles.kpiBox}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E', textAlign: 'center' }}>{fmtMoney(property.monthlyRent)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>الإيجار الشهري</Text>
            </View>
          )}
          {property.totalRevenue !== undefined && (
            <View style={styles.kpiBox}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#3B82F6', textAlign: 'center' }}>{fmtMoney(property.totalRevenue)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>إجمالي الإيرادات</Text>
            </View>
          )}
        </View>
      )}

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
              { label: 'النوع', value: property.type },
              { label: 'المدينة', value: property.city },
              { label: 'المساحة', value: property.area !== undefined ? `${property.area} م²` : undefined },
              { label: 'الطوابق', value: property.floors !== undefined ? String(property.floors) : undefined },
              { label: 'المالك', value: property.ownerName },
              { label: 'إدارة', value: property.managedBy },
              { label: 'سنة البناء', value: property.yearBuilt !== undefined ? String(property.yearBuilt) : undefined },
              { label: 'الوصف', value: property.description },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 90, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'units' && (
          unitsLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          units.length === 0 ? <GEmptyState icon="grid-outline" title="لا وحدات" description="لا توجد وحدات مسجّلة لهذا العقار" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {units.map((unit, i) => {
              const st = statusBadge(unit.status ?? '');
              const num = unit.unitNumber ?? unit.number ?? `#${unit.id}`;
              return (
                <View key={unit.id} style={[styles.listRow, { borderBottomColor: c.border }, i === units.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>وحدة {num}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {unit.type ?? ''}{unit.area !== undefined ? ` · ${unit.area} م²` : ''}{unit.rent !== undefined ? ` · ${fmtMoney(unit.rent)}` : ''}
                    </Text>
                    {unit.tenantName ? <Text style={{ fontSize: 12, color: '#3B82F6', textAlign: 'right' }}>{unit.tenantName}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {tab === 'contracts' && (
          contrLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          contracts.length === 0 ? <GEmptyState icon="document-text-outline" title="لا عقود" description="لا توجد عقود إيجار لهذا العقار" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {contracts.map((con, i) => {
              const st = statusBadge(con.status ?? '');
              return (
                <View key={con.id} style={[styles.listRow, { borderBottomColor: c.border }, i === contracts.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{con.tenantName ?? `عقد #${con.id}`}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(con.startDate)} — {fmtDate(con.endDate)}
                      {con.monthlyRent !== undefined ? ` · ${fmtMoney(con.monthlyRent)}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {tab === 'maintenance' && (
          maintLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          maintenance.length === 0 ? <GEmptyState icon="build-outline" title="لا صيانة" description="لا توجد طلبات صيانة لهذا العقار" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {maintenance.map((m, i) => {
              const st = statusBadge(m.status ?? '');
              return (
                <View key={m.id} style={[styles.listRow, { borderBottomColor: c.border }, i === maintenance.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{m.title ?? m.description ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {m.type ?? ''}{m.reportedAt ? ` · ${fmtDate(m.reportedAt)}` : ''}
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
  header: { padding: 20 },
  kpiRow: { flexDirection: 'row', borderBottomWidth: 1 },
  kpiBox: { flex: 1, padding: 12, alignItems: 'center', gap: 2 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
