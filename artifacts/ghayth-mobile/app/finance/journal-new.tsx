/**
 * قيد محاسبي يدوي جديد — POST /api/finance/journal-entries
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

interface Account { id: number; name?: string; code?: string; accountCode?: string }
interface ListResp<T> { data?: T[] }

interface JournalLine {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

export default function JournalNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [reference, setReference] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: accountsResp } = useList<ListResp<Account>>('/api/finance/chart-of-accounts', { pageSize: 500 });
  const accountOptions = (accountsResp?.data ?? []).map(a => ({
    value: String(a.id),
    label: `${a.code ?? a.accountCode ?? ''} — ${a.name ?? `حساب #${a.id}`}`,
  }));

  const mutation = useMutation('/api/finance/journal-entries', 'POST');

  const addLine = () => setLines(prev => [...prev, { accountId: '', description: '', debit: '', credit: '' }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof JournalLine, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (lines.some(l => !l.accountId)) errs.accounts = 'اختر الحساب لكل سطر';
    if (lines.some(l => !Number(l.debit) && !Number(l.credit))) errs.amounts = 'كل سطر يجب أن يحمل مدين أو دائن';
    if (!isBalanced) errs.balance = `القيد غير متوازن: مدين ${totalDebit.toFixed(2)} — دائن ${totalCredit.toFixed(2)}`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        lines: lines.filter(l => l.accountId).map(l => ({
          accountId: Number(l.accountId),
          description: l.description || undefined,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      };
      if (reference) body.reference = reference;
      if (entryDate) body.entryDate = entryDate;
      if (description) body.description = description;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/journal-entries'] });
      Alert.alert('تم', 'تم إنشاء القيد المحاسبي بنجاح وهو في انتظار الاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء القيد');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'قيد محاسبي يدوي' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput label="المرجع" value={reference} onChangeText={setReference} placeholder="رقم المرجع (اختياري)" />
          <DateInput label="التاريخ" value={entryDate} onChange={setEntryDate} />
          <GInput label="البيان العام" value={description} onChangeText={setDescription} placeholder="وصف القيد..." multiline />
        </GCard>

        <GText variant="subheading" style={{ fontWeight: '700', marginTop: 4 }}>سطور القيد</GText>
        {errors.accounts ? <Text style={{ color: c.danger, fontSize: 12, textAlign: 'right' }}>{errors.accounts}</Text> : null}
        {errors.amounts ? <Text style={{ color: c.danger, fontSize: 12, textAlign: 'right' }}>{errors.amounts}</Text> : null}

        {lines.map((line, i) => (
          <GCard key={i} style={{ gap: 8 }}>
            <View style={styles.lineHeader}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>سطر {i + 1}</Text>
              {lines.length > 2 && (
                <Pressable onPress={() => removeLine(i)}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              )}
            </View>
            <GSelect
              label="الحساب *"
              value={line.accountId}
              onChange={v => updateLine(i, 'accountId', v)}
              options={accountOptions}
              placeholder="اختر الحساب..."
            />
            <GInput label="البيان" value={line.description} onChangeText={v => updateLine(i, 'description', v)} placeholder="بيان السطر (اختياري)" />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <GInput label="مدين" value={line.debit} onChangeText={v => { updateLine(i, 'debit', v); if (v) updateLine(i, 'credit', ''); }} keyboardType="numeric" placeholder="0.00" />
              </View>
              <View style={{ flex: 1 }}>
                <GInput label="دائن" value={line.credit} onChangeText={v => { updateLine(i, 'credit', v); if (v) updateLine(i, 'debit', ''); }} keyboardType="numeric" placeholder="0.00" />
              </View>
            </View>
          </GCard>
        ))}

        <GButton title="إضافة سطر" icon="add-circle-outline" variant="secondary" onPress={addLine} />

        {/* ميزان القيد */}
        <GCard style={{ gap: 0, padding: 0 }}>
          <View style={[styles.balanceRow, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            <Text style={{ fontSize: 14, color: c.text, fontWeight: '600' }}>{totalDebit.toLocaleString('ar-SA', { maximumFractionDigits: 2 })}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>إجمالي المدين</Text>
          </View>
          <View style={[styles.balanceRow, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            <Text style={{ fontSize: 14, color: c.text, fontWeight: '600' }}>{totalCredit.toLocaleString('ar-SA', { maximumFractionDigits: 2 })}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>إجمالي الدائن</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: isBalanced ? '#22C55E' : c.danger }}>
              {isBalanced ? 'متوازن ✓' : `فرق: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
            </Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>حالة الميزان</Text>
          </View>
        </GCard>

        {errors.balance ? <Text style={{ color: c.danger, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>{errors.balance}</Text> : null}

        <GButton title="إرسال للاعتماد" icon="send-outline" onPress={onSubmit} loading={mutation.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
});
