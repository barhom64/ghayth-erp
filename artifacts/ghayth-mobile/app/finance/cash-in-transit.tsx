/**
 * النقد في الطريق
 * GET /api/finance/cash-in-transit
 */
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton, GCard, GInput } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch, useMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { statusBadge } from '@/lib/moduleSections';
import { DateInput } from '@/components/DateInput';

interface CashTransfer {
  id: number;
  reference?: string;
  sourceAccountCode?: string;
  destinationAccountCode?: string;
  clearingAccountCode?: string;
  amount?: number;
  currency?: string;
  sentDate?: string;
  confirmedDate?: string;
  status?: string;
  notes?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (!val) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CashInTransitScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError, refetch } = useList<CashTransfer[]>('/api/finance/cash-in-transit');
  const transfers = Array.isArray(data) ? data : [];

  const mutation = useMutation('/api/finance/cash-in-transit', 'POST');
  const [srcAccount, setSrcAccount] = useState('');
  const [dstAccount, setDstAccount] = useState('');
  const [clearingAccount, setClearingAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [sentDate, setSentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!srcAccount || !dstAccount || !clearingAccount || !amount) {
      Alert.alert('خطأ', 'الحقول المطلوبة: الحساب المصدر، الهدف، المقاصّة، والمبلغ');
      return;
    }
    setSaving(true);
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        sourceAccountCode: srcAccount,
        destinationAccountCode: dstAccount,
        clearingAccountCode: clearingAccount,
        amount: Number(amount),
        sentDate: sentDate || undefined,
        notes: notes || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['/api/finance/cash-in-transit'] });
      setShowForm(false);
      setSrcAccount(''); setDstAccount(''); setClearingAccount('');
      setAmount(''); setSentDate(''); setNotes('');
    } catch {
      Alert.alert('خطأ', 'تعذّر إنشاء التحويل');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (id: number) => {
    Alert.alert('تأكيد الاستلام', 'هل تريد تأكيد استلام النقد وإغلاق القيد؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد', onPress: async () => {
          try {
            await apiFetch(`/api/finance/cash-in-transit/${id}/confirm`, { method: 'POST', body: JSON.stringify({}) });
            await qc.invalidateQueries({ queryKey: ['/api/finance/cash-in-transit'] });
          } catch { Alert.alert('خطأ', 'تعذّر التأكيد'); }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحويلات النقد في الطريق…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'النقد في الطريق' }} />

      {showForm ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          <GCard style={{ gap: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right' }}>تحويل نقد جديد</Text>
            <GInput label="حساب المصدر *" value={srcAccount} onChangeText={setSrcAccount} placeholder="كود الحساب المصدر" />
            <GInput label="حساب الهدف *" value={dstAccount} onChangeText={setDstAccount} placeholder="كود الحساب الهدف" />
            <GInput label="حساب المقاصّة *" value={clearingAccount} onChangeText={setClearingAccount} placeholder="كود حساب النقد في الطريق" />
            <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" />
            <DateInput label="تاريخ الإرسال" value={sentDate} onChange={setSentDate} />
            <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="ملاحظات اختيارية" multiline />
          </GCard>
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <GButton title="حفظ" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
            <GButton title="إلغاء" onPress={() => setShowForm(false)} variant="secondary" style={{ flex: 1 }} />
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
            <GButton title="تحويل نقد جديد" onPress={() => setShowForm(true)} variant="primary" />
          </View>
          <FlatList
            data={transfers}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
            onRefresh={refetch}
            refreshing={isLoading}
            ListEmptyComponent={
              <GEmptyState icon="swap-horizontal-outline" title="لا توجد تحويلات" description="لا توجد تحويلات نقدية في الطريق حالياً" />
            }
            renderItem={({ item }) => {
              const st = statusBadge(item.status ?? '');
              const isPending = item.status === 'pending' || item.status === 'in_transit';
              return (
                <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                      {fmtMoney(item.amount, item.currency)}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                      {item.reference ?? `#${item.id}`} · {fmtDate(item.sentDate)}
                    </Text>
                    <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                      {item.sourceAccountCode} → {item.destinationAccountCode}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {st ? <GStatusBadge status={st.label} size="sm" /> : null}
                    {isPending && (
                      <Pressable
                        onPress={() => handleConfirm(item.id)}
                        style={({ pressed }) => [styles.confirmBtn, { backgroundColor: pressed ? '#22C55ECC' : '#22C55E' }]}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>تأكيد الاستلام</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  confirmBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
