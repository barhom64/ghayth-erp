/**
 * متابعة تحصيل
 * POST /api/finance/collections
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENTMETHOD_OPTIONS = [
  { label: 'نقدي', value: 'cash' },
  { label: 'تحويل', value: 'transfer' },
  { label: 'شيك', value: 'check' },
];

export default function متابعةتحصيلScreen() {
  const c = useColors();
  const router = useRouter();

  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/collections', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!clientName) e['clientName'] = 'اسم العميل مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        clientName: clientName || undefined,
        amount: amount || undefined,
        paymentMethod: paymentMethod || undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'متابعة تحصيل' }} />

      <GCard style={styles.card}>
        <GInput label="اسم العميل *" value={clientName} onChangeText={setClientName} placeholder="اسم العميل" error={errors["clientName"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <GSelect label="طريقة الدفع" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENTMETHOD_OPTIONS} />
        <DateInput label="تاريخ الاستحقاق" value={dueDate} onChange={setDueDate} error={errors["dueDate"]} />
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
