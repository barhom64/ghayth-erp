/**
 * تفاصيل الوحدة العقارية
 * GET /api/properties/units/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PropertyUnit {
  id: number;
  ref?: string;
  unitNumber?: string;
  propertyName?: string;
  propertyId?: number;
  floor?: string | number;
  unitType?: string;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: string;
  tenantName?: string;
  tenantId?: number;
  rentAmount?: number;
  currency?: string;
  leaseStart?: string;
  leaseEnd?: string;
  lastMaintenanceDate?: string;
  description?: string;
  amenities?: string[];
  maintenanceRequests?: { id: number; title?: string; status?: string; date?: string }[];
}

type Tab = 'info' | 'maintenance';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function UnitDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: unit, isLoading } = useList<PropertyUnit>(`/api/properties/units/${id}`);
  const { data: mRequests } = useList<{ id: number; title?: string; status?: string; date?: string }[]>(
    `/api/properties/maintenance-requests?unitId=${id}`, undefined, { enabled: tab === 'maintenance' }
  );

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الوحدة…" />;
  if (!unit) return <GEmptyState icon="business-outline" title="وحدة غير موجودة" description="تعذّر العثور على بيانات الوحدة" />;

  const ref = unit.ref ?? unit.unitNumber ?? `#${unit.id}`;
  const st = statusBadge(unit.status ?? '');
  const isVacant = (unit.status ?? '').toLowerCase() === 'vacant' || (unit.status ?? '').includes('شاغر');
  const maintenanceList = unit.maintenanceRequests ?? (Array.isArray(mRequests) ? mRequests : []);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'maintenance', label: 'الصيانة' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `وحدة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: isVacant ? '#22C55E' : c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{unit.unitNumber ?? '—'}</Text>
          {unit.propertyName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{unit.propertyName}</Text> : null}
          {unit.unitType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{unit.unitType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          {unit.area !== undefined ? (
            <>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{unit.area}</Text>
              <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>م²</Text>
            </>
          ) : <Ionicons name="business-outline" size={40} color="#FFFFFF80" />}
        </View>
      </View>

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
          <>
            {/* KPIs */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { label: 'غرف النوم', value: unit.bedrooms ?? '—' },
                { label: 'الحمامات', value: unit.bathrooms ?? '—' },
                { label: 'الطابق', value: unit.floor ?? '—' },
              ].map(item => (
                <GCard key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: c.brand }}>{item.value}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{item.label}</Text>
                </GCard>
              ))}
            </View>

            {/* الإيجار الحالي */}
            {unit.tenantName && (
              <GCard style={{ gap: 6 }}>
                <GText variant="caption" color="muted">المستأجر الحالي</GText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{fmtMoney(unit.rentAmount, unit.currency)}/شهر</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{unit.tenantName}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(unit.leaseEnd)}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(unit.leaseStart)} — </Text>
                </View>
              </GCard>
            )}

            {/* بيانات عامة */}
            <GCard style={{ gap: 0, padding: 0 }}>
              {[
                { label: 'نوع الوحدة', value: unit.unitType },
                { label: 'آخر صيانة', value: unit.lastMaintenanceDate ? fmtDate(unit.lastMaintenanceDate) : undefined },
              ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
                </View>
              ))}
            </GCard>

            {unit.description ? (
              <GCard>
                <GText variant="caption" color="muted">الوصف</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{unit.description}</Text>
              </GCard>
            ) : null}
          </>
        )}

        {tab === 'maintenance' && (
          maintenanceList.length === 0
            ? <GEmptyState icon="construct-outline" title="لا توجد طلبات صيانة" description="لم يتم تسجيل طلبات صيانة لهذه الوحدة" />
            : maintenanceList.map((req, i) => {
              const rs = statusBadge(req.status ?? '');
              return (
                <GCard key={req.id ?? i} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {rs ? <GStatusBadge status={rs.label} size="sm" /> : null}
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', flex: 1 }}>{req.title ?? '—'}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{fmtDate(req.date)}</Text>
                </GCard>
              );
            })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
