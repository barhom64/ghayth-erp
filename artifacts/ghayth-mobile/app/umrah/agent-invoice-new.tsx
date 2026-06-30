/**
 * فاتورة وكيل عمرة جديدة
 * POST /api/umrah/agent-invoices
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STATUS_OPTIONS = [
  { label: 'مسودة', value: 'draft' },
  { label: 'مرسلة', value: 'sent' },
  { label: 'مدفوعة', value: 'paid' },
];

export default function فاتورةوكيلعمرةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [agentName, setAgentName] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/agent-invoices', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!agentName) e['agentName'] = 'الوكيل مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!invoiceDate) e['invoiceDate'] = 'تاريخ الفاتورة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        agentName: agentName || undefined,
        amount: amount || undefined,
        invoiceDate: invoiceDate || undefined,
        status: status || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فاتورة وكيل عمرة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="الوكيل *" value={agentName} onChangeText={setAgentName} placeholder="اسم الوكيل" error={errors["agentName"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <DateInput label="تاريخ الفاتورة *" value={invoiceDate} onChange={setInvoiceDate} error={errors["invoiceDate"]} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
