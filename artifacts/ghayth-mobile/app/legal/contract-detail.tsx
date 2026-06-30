/**
 * تفاصيل العقد القانوني
 * GET /api/legal/contracts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface LegalContract {
  id: number;
  ref?: string;
  title?: string;
  contractType?: string;
  parties?: string;
  partyA?: string;
  partyB?: string;
  signedDate?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  value?: number;
  currency?: string;
  responsibleLawyer?: string;
  description?: string;
  scope?: string;
  obligations?: string;
  penalties?: string;
  renewalTerms?: string;
  terminationTerms?: string;
  governingLaw?: string;
  disputeResolution?: string;
  nextReviewDate?: string;
  attachments?: { id: number; name?: string }[];
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

export default function LegalContractDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: contract, isLoading } = useList<LegalContract>(`/api/legal/contracts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقد…" />;
  if (!contract) return <GEmptyState icon="document-text-outline" title="عقد غير موجود" description="تعذّر العثور على بيانات العقد القانوني" />;

  const ref = contract.ref ?? `#${contract.id}`;
  const st = statusBadge(contract.status ?? '');
  const attachments = contract.attachments ?? [];
  const isExpiring = contract.endDate && new Date(contract.endDate) < new Date(Date.now() + 60 * 24 * 3600 * 1000);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `عقد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{contract.title ?? '—'}</Text>
          {contract.contractType ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{contract.contractType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {contract.value !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(contract.value, contract.currency)}</Text>
            <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>قيمة العقد</Text>
          </View>
        ) : <Ionicons name="document-text-outline" size={40} color={c.onPrimary + '80'} />}
      </View>

      {/* تحذير انتهاء */}
      {isExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>ينتهي العقد قريبًا: {fmtDate(contract.endDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الطرف الأول', value: contract.partyA ?? contract.parties },
            { label: 'الطرف الثاني', value: contract.partyB },
            { label: 'المحامي المسؤول', value: contract.responsibleLawyer },
            { label: 'تاريخ التوقيع', value: contract.signedDate ? fmtDate(contract.signedDate) : undefined },
            { label: 'تاريخ البداية', value: contract.startDate ? fmtDate(contract.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: contract.endDate ? fmtDate(contract.endDate) : undefined },
            { label: 'القانون الحاكم', value: contract.governingLaw },
            { label: 'تاريخ المراجعة القادمة', value: contract.nextReviewDate ? fmtDate(contract.nextReviewDate) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {contract.scope ? (
          <GCard>
            <GText variant="caption" color="muted">نطاق العقد</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{contract.scope}</Text>
          </GCard>
        ) : null}

        {contract.obligations ? (
          <GCard>
            <GText variant="caption" color="muted">الالتزامات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{contract.obligations}</Text>
          </GCard>
        ) : null}

        {contract.penalties ? (
          <GCard>
            <GText variant="caption" color="muted">الغرامات والجزاءات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{contract.penalties}</Text>
          </GCard>
        ) : null}

        {contract.renewalTerms ? (
          <GCard>
            <GText variant="caption" color="muted">شروط التجديد</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{contract.renewalTerms}</Text>
          </GCard>
        ) : null}

        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المستندات المرفقة</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="document-text-outline" size={16} color={c.brand} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مستند ${att.id}`}</Text>
              </View>
            ))}
          </GCard>
        )}

        <GButton title="ملحق عقد" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/legal/contract-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
