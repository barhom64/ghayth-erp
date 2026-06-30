/**
 * تفاصيل الالتزام التعاقدي
 * GET /api/finance/commitments/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Commitment {
  id: number;
  ref?: string;
  title?: string;
  vendorName?: string;
  supplierName?: string;
  contractRef?: string;
  amount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currency?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
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

export default function CommitmentDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: com, isLoading } = useList<Commitment>(`/api/finance/commitments/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الالتزام…" />;
  if (!com) return <GEmptyState icon="document-lock-outline" title="التزام غير موجود" description="تعذّر العثور على بيانات الالتزام التعاقدي" />;

  const st = statusBadge(com.status ?? '');
  const vendorName = com.vendorName ?? com.supplierName;
  const endDate = com.endDate ? new Date(com.endDate) : null;
  const nearExpiry = endDate && endDate < new Date(Date.now() + 30 * 86400000);
  const paidPct = com.amount && com.paidAmount !== undefined ? Math.min(100, Math.round((com.paidAmount / com.amount) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: com.title ?? com.ref ?? 'الالتزام' }} />

      <View style={[styles.header, { backgroundColor: '#0891B2' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{com.title ?? '—'}</Text>
          {vendorName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{vendorName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(com.amount, com.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>قيمة الالتزام</Text>
        </View>
      </View>

      {nearExpiry && (
        <View style={{ backgroundColor: '#FFF7ED', borderBottomColor: '#FED7AA', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="time-outline" size={18} color="#F97316" />
          <Text style={{ fontSize: 13, color: '#F97316', fontWeight: '600' }}>الالتزام ينتهي قريبًا: {fmtDate(com.endDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {(com.paidAmount !== undefined || com.remainingAmount !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {com.paidAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(com.paidAmount, com.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المُسدَّد</Text>
              </GCard>
            )}
            {com.remainingAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#EF4444' }}>{fmtMoney(com.remainingAmount, com.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المتبقي</Text>
              </GCard>
            )}
          </View>
        )}

        {com.amount && com.paidAmount !== undefined ? (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${paidPct}%`, backgroundColor: '#22C55E', borderRadius: 3 }} />
          </View>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المورد / الجهة', value: vendorName },
            { label: 'العقد المرتبط', value: com.contractRef },
            { label: 'تاريخ البداية', value: com.startDate ? fmtDate(com.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: com.endDate ? fmtDate(com.endDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {com.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{com.description}</Text>
          </GCard>
        ) : null}

        {com.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{com.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
