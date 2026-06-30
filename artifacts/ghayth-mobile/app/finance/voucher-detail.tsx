/**
 * تفاصيل السند المالي
 * GET /api/finance/vouchers/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Voucher {
  id: number;
  ref?: string;
  voucherNumber?: string;
  voucherType?: string;
  date?: string;
  status?: string;
  amount?: number;
  currency?: string;
  payee?: string;
  payer?: string;
  account?: string;
  bankAccount?: string;
  paymentMethod?: string;
  reference?: string;
  description?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  lines?: VoucherLine[];
}

interface VoucherLine {
  id?: number;
  account?: string;
  description?: string;
  debit?: number;
  credit?: number;
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

export default function VoucherDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: voucher, isLoading } = useList<Voucher>(`/api/finance/vouchers/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل السند…" />;
  if (!voucher) return <GEmptyState icon="receipt-outline" title="سند غير موجود" description="تعذّر العثور على بيانات السند" />;

  const ref = voucher.ref ?? voucher.voucherNumber ?? `#${voucher.id}`;
  const st = statusBadge(voucher.status ?? '');
  const lines = voucher.lines ?? [];
  const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `سند ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{voucher.voucherType ?? 'سند'} {ref}</Text>
          {voucher.payee ?? voucher.payer ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{voucher.payee ?? voucher.payer}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(voucher.amount, voucher.currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>المبلغ</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'التاريخ', value: voucher.date ? fmtDate(voucher.date) : undefined },
            { label: 'طريقة الدفع', value: voucher.paymentMethod },
            { label: 'الحساب البنكي', value: voucher.bankAccount },
            { label: 'المرجع', value: voucher.reference },
            { label: 'معتمد من', value: voucher.approvedBy },
            { label: 'تاريخ الاعتماد', value: voucher.approvedAt ? fmtDate(voucher.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {voucher.description ? (
          <GCard>
            <GText variant="caption" color="muted">البيان</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{voucher.description}</Text>
          </GCard>
        ) : null}

        {lines.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">سطور السند</GText>
            {/* رأس الجدول */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, width: 80, textAlign: 'center' }}>دائن</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, width: 80, textAlign: 'center' }}>مدين</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, flex: 1, textAlign: 'right' }}>الحساب</Text>
            </View>
            {lines.map((line, i) => (
              <View key={line.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < lines.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: '#22C55E', width: 80, textAlign: 'center' }}>{line.credit ? fmtMoney(line.credit, voucher.currency) : '—'}</Text>
                <Text style={{ fontSize: 13, color: '#EF4444', width: 80, textAlign: 'center' }}>{line.debit ? fmtMoney(line.debit, voucher.currency) : '—'}</Text>
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{line.account ?? '—'}</Text>
              </View>
            ))}
            {/* مجاميع */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 2, borderTopColor: c.border, marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E', width: 80, textAlign: 'center' }}>{fmtMoney(totalCredit, voucher.currency)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444', width: 80, textAlign: 'center' }}>{fmtMoney(totalDebit, voucher.currency)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>المجموع</Text>
            </View>
          </GCard>
        )}

        <GButton title="سند جديد" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/finance/voucher-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
