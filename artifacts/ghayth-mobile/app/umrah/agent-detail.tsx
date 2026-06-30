/**
 * تفاصيل الوكيل / وكيل الفرعي
 * GET /api/umrah/agents/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahAgent {
  id: number;
  ref?: string;
  name?: string;
  agentType?: string;
  country?: string;
  city?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  status?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  commission?: number;
  totalPilgrims?: number;
  totalBookings?: number;
  balance?: number;
  currency?: string;
  notes?: string;
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

export default function UmrahAgentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: agent, isLoading } = useList<UmrahAgent>(`/api/umrah/agents/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الوكيل…" />;
  if (!agent) return <GEmptyState icon="business-outline" title="وكيل غير موجود" description="تعذّر العثور على بيانات الوكيل" />;

  const ref = agent.ref ?? `#${agent.id}`;
  const st = statusBadge(agent.status ?? '');
  const licenseExpiring = agent.licenseExpiry && new Date(agent.licenseExpiry) < new Date(Date.now() + 30 * 24 * 3600 * 1000);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: agent.name ?? 'الوكيل' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#059669' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{agent.name ?? '—'}</Text>
          {agent.country ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{agent.country}{agent.city ? ` — ${agent.city}` : ''}</Text> : null}
          {agent.agentType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{agent.agentType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{agent.totalPilgrims ?? 0}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>معتمر</Text>
        </View>
      </View>

      {licenseExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>الترخيص ينتهي قريبًا: {fmtDate(agent.licenseExpiry)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {/* KPIs */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'إجمالي المعتمرين', value: agent.totalPilgrims ?? 0, color: c.brand },
            { label: 'الحجوزات', value: agent.totalBookings ?? 0, color: '#059669' },
          ].map(item => (
            <GCard key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: item.color }}>{item.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{item.label}</Text>
            </GCard>
          ))}
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'جهة الاتصال', value: agent.contactPerson },
            { label: 'البريد الإلكتروني', value: agent.email },
            { label: 'الهاتف', value: agent.phone },
            { label: 'رقم الترخيص', value: agent.licenseNumber },
            { label: 'انتهاء الترخيص', value: agent.licenseExpiry ? fmtDate(agent.licenseExpiry) : undefined },
            { label: 'نسبة العمولة', value: agent.commission !== undefined ? `${agent.commission}%` : undefined },
            { label: 'الرصيد', value: agent.balance !== undefined ? fmtMoney(agent.balance, agent.currency) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {agent.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{agent.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="فاتورة وكيل جديدة" icon="document-text-outline" variant="secondary" onPress={() => router.push({ pathname: '/umrah/agent-invoice-new' as never, params: { agentId: id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
