/**
 * تفاصيل المستأجر
 * GET /api/properties/tenants/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Tenant {
  id: number;
  ref?: string;
  name?: string;
  nationalId?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  status?: string;
  currentUnit?: string;
  propertyName?: string;
  leaseStart?: string;
  leaseEnd?: string;
  rentAmount?: number;
  currency?: string;
  balance?: number;
  totalPaid?: number;
  outstandingAmount?: number;
  notes?: string;
  contracts?: { id: number; unitNumber?: string; status?: string; endDate?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function TenantDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: tenant, isLoading } = useList<Tenant>(`/api/properties/tenants/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المستأجر…" />;
  if (!tenant) return <GEmptyState icon="person-outline" title="مستأجر غير موجود" description="تعذّر العثور على بيانات المستأجر" />;

  const ref = tenant.ref ?? `#${tenant.id}`;
  const st = statusBadge(tenant.status ?? '');
  const hasOutstanding = (tenant.outstandingAmount ?? 0) > 0;
  const contracts = tenant.contracts ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: tenant.name ?? 'المستأجر' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: hasOutstanding ? '#EF4444' : c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{tenant.name ?? '—'}</Text>
          {tenant.currentUnit ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>وحدة {tenant.currentUnit}</Text> : null}
          {tenant.propertyName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{tenant.propertyName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(tenant.rentAmount, tenant.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الإيجار الشهري</Text>
          {hasOutstanding ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFCCCC', marginTop: 4 }}>{fmtMoney(tenant.outstandingAmount, tenant.currency)}</Text>
              <Text style={{ fontSize: 10, color: '#FFCCCC' }}>متأخرات</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* المالية */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'إجمالي المدفوع', value: fmtMoney(tenant.totalPaid, tenant.currency), color: '#22C55E' },
            { label: 'المتأخرات', value: fmtMoney(tenant.outstandingAmount, tenant.currency), color: hasOutstanding ? '#EF4444' : c.text },
          ].map(item => (
            <GCard key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: item.color }}>{item.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{item.label}</Text>
            </GCard>
          ))}
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم الهوية', value: tenant.nationalId },
            { label: 'الجنسية', value: tenant.nationality },
            { label: 'البريد الإلكتروني', value: tenant.email },
            { label: 'الهاتف', value: tenant.phone },
            { label: 'بداية العقد', value: tenant.leaseStart ? fmtDate(tenant.leaseStart) : undefined },
            { label: 'نهاية العقد', value: tenant.leaseEnd ? fmtDate(tenant.leaseEnd) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {contracts.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">العقود ({contracts.length})</GText>
            {contracts.map((ct, i) => {
              const cs = statusBadge(ct.status ?? '');
              return (
                <View key={ct.id ?? i} style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{ct.endDate ? fmtDate(ct.endDate) : '—'}</Text>
                  {cs ? <GStatusBadge status={cs.label} size="sm" /> : null}
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{ct.unitNumber ?? `عقد ${ct.id}`}</Text>
                </View>
              );
            })}
          </GCard>
        )}

        {tenant.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{tenant.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="عقد إيجار جديد" icon="document-text-outline" variant="secondary" onPress={() => router.push({ pathname: '/properties/lease-new' as never, params: { tenantId: id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
