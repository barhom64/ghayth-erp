/**
 * تفاصيل الحساب البنكي
 * GET /api/finance/bank-accounts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BankAccount {
  id: number;
  ref?: string;
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  currency?: string;
  balance?: number;
  lastReconciled?: string;
  reconciliationBalance?: number;
  branchName?: string;
  status?: string;
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

export default function BankAccountDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: acct, isLoading } = useList<BankAccount>(`/api/finance/bank-accounts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحساب…" />;
  if (!acct) return <GEmptyState icon="card-outline" title="حساب غير موجود" description="تعذّر العثور على بيانات الحساب البنكي" />;

  const balance = acct.balance ?? 0;
  const isNegative = balance < 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: acct.accountName ?? 'الحساب البنكي' }} />

      <View style={[styles.header, { backgroundColor: isNegative ? '#EF4444' : '#0EA5E9' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{acct.bankName ?? '—'}</Text>
          {acct.accountName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{acct.accountName}</Text> : null}
          {acct.branchName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{acct.branchName}</Text> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(balance, acct.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الرصيد</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {acct.reconciliationBalance !== undefined && (
          <GCard style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand }}>{fmtMoney(acct.reconciliationBalance, acct.currency)}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>رصيد التسوية</Text>
            {acct.lastReconciled ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>آخر تسوية: {fmtDate(acct.lastReconciled)}</Text> : null}
          </GCard>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'اسم الحساب', value: acct.accountName },
            { label: 'البنك', value: acct.bankName },
            { label: 'رقم الحساب', value: acct.accountNumber },
            { label: 'IBAN', value: acct.iban },
            { label: 'العملة', value: acct.currency },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {acct.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{acct.notes}</Text>
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
