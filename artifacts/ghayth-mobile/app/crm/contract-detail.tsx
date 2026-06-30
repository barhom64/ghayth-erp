/**
 * تفاصيل العقد التجاري
 * GET /api/crm/contracts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface CrmContract {
  id: number;
  title?: string;
  ref?: string;
  clientName?: string;
  value?: number;
  currency?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  signedDate?: string;
  description?: string;
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

export default function CrmContractDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: con, isLoading } = useList<CrmContract>(`/api/crm/contracts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات العقد…" />;
  if (!con) return <GEmptyState icon="document-text-outline" title="عقد غير موجود" description="تعذّر العثور على بيانات العقد التجاري" />;

  const st = statusBadge(con.status ?? '');
  const endDate = con.endDate ? new Date(con.endDate) : null;
  const nearExpiry = endDate && endDate > new Date() && endDate < new Date(Date.now() + 30 * 86400000);
  const expired = endDate && endDate < new Date() && con.status === 'active';

  const headerColor = expired ? '#EF4444' : con.status === 'active' ? '#16A34A' : '#6B7280';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: con.title ?? con.ref ?? 'العقد التجاري' }} />

      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{con.title ?? '—'}</Text>
          {con.clientName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{con.clientName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {con.value !== undefined && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(con.value, con.currency)}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>قيمة العقد</Text>
          </View>
        )}
      </View>

      {(nearExpiry || expired) && (
        <View style={{ backgroundColor: expired ? '#FEF2F2' : '#FFF7ED', borderBottomColor: expired ? '#FCA5A5' : '#FED7AA', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="time-outline" size={18} color={expired ? '#EF4444' : '#F97316'} />
          <Text style={{ fontSize: 13, color: expired ? '#EF4444' : '#F97316', fontWeight: '600' }}>
            {expired ? `انتهى العقد: ${fmtDate(con.endDate)}` : `ينتهي قريبًا: ${fmtDate(con.endDate)}`}
          </Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل', value: con.clientName },
            { label: 'تاريخ التوقيع', value: con.signedDate ? fmtDate(con.signedDate) : undefined },
            { label: 'تاريخ البداية', value: con.startDate ? fmtDate(con.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: con.endDate ? fmtDate(con.endDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {con.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{con.description}</Text>
          </GCard>
        ) : null}

        {con.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{con.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="تجديد العقد" icon="refresh-outline" variant="secondary" onPress={() => router.push('/crm/contract-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
