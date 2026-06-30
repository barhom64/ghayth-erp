/**
 * تسجيل دفعة معتمر عمرة
 * POST /api/umrah/payments
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENT_METHODS = [
  { label: 'تحويل بنكي', value: 'bank_transfer' },
  { label: 'نقد', value: 'cash' },
  { label: 'شيك', value: 'check' },
  { label: 'مدى', value: 'mada' },
  { label: 'فيزا/ماستر', value: 'visa' },
  { label: 'STC Pay', value: 'stc_pay' },
];

export default function UmrahPaymentNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { pilgrimId } = useLocalSearchParams<{ pilgrimId?: string }>();

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/payments', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'أدخل مبلغًا صحيحًا';
    if (!paymentDate) e.paymentDate = 'تاريخ الدفعة مطلوب';
    if (!method) e.method = 'طريقة الدفع مطلوبة';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        pilgrimId: pilgrimId ? Number(pilgrimId) : undefined,
        amount: Number(amount),
        paymentDate,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل الدفعة بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الدفعة');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تسجيل دفعة معتمر' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل الدفعة</Text>
        <GInput
          label="المبلغ (ر.س) *"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0.00"
          error={errors.amount}
        />
        <DateInput
          label="تاريخ الدفعة *"
          value={paymentDate}
          onChange={setPaymentDate}
          error={errors.paymentDate}
        />
        <GSelect
          label="طريقة الدفع *"
          value={method}
          onChange={setMethod}
          options={PAYMENT_METHODS}
          error={errors.method}
        />
        <GInput
          label="رقم المرجع / الإيصال"
          value={reference}
          onChangeText={setReference}
          placeholder="رقم الحوالة أو الشيك"
        />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="ملاحظات إضافية…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 60, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton
        title="تسجيل الدفعة"
        onPress={handleSubmit}
        loading={mutation.isPending}
        style={{ marginTop: 4 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60 },
});
