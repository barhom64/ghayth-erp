/**
 * تفاصيل عقد المورد
 * GET /api/finance/vendor-contracts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface VendorContract {
  id: number;
  ref?: string;
  contractNumber?: string;
  vendorName?: string;
  vendorId?: number;
  title?: string;
  contractType?: string;
  status?: string;
  value?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  paymentTerms?: string;
  scope?: string;
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

export default function VendorContractDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: contract, isLoading } = useList<VendorContract>(`/api/finance/vendor-contracts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات العقد…" />;
  if (!contract) return <GEmptyState icon="document-text-outline" title="عقد غير موجود" description="تعذّر العثور على بيانات عقد المورد" />;

  const st = statusBadge(contract.status ?? '');
  const expiry = contract.endDate ? new Date(contract.endDate) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
  const expiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: contract.contractNumber ?? 'عقد المورد' }} />

      <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{contract.vendorName ?? contract.title ?? '—'}</Text>
          {contract.contractType ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{contract.contractType}</Text> : null}
          {contract.contractNumber ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{contract.contractNumber}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(contract.value, contract.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>قيمة العقد</Text>
        </View>
      </View>

      {expiring && (
        <View style={{ backgroundColor: '#FFFBEB', borderBottomColor: '#FCD34D', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#F59E0B" />
          <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '600' }}>ينتهي العقد خلال {daysLeft} يوم</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المورد', value: contract.vendorName },
            { label: 'نوع العقد', value: contract.contractType },
            { label: 'تاريخ البداية', value: contract.startDate ? fmtDate(contract.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: contract.endDate ? fmtDate(contract.endDate) : undefined },
            { label: 'شروط الدفع', value: contract.paymentTerms },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {contract.scope ? (
          <GCard>
            <GText variant="caption" color="muted">نطاق العقد</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{contract.scope}</Text>
          </GCard>
        ) : null}

        {contract.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{contract.notes}</Text>
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
