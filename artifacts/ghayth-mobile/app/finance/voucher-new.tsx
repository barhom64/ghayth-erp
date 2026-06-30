/**
 * سند قبض/صرف جديد
 * POST /api/finance/vouchers
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const VOUCHERTYPE_OPTIONS = [
  { label: 'قبض', value: 'receipt' },
  { label: 'صرف', value: 'payment' },
];

const PAYMENTMETHOD_OPTIONS = [
  { label: 'نقدي', value: 'cash' },
  { label: 'تحويل', value: 'transfer' },
  { label: 'شيك', value: 'check' },
];

export default function VoucherNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [voucherType, setVoucherType] = useState('receipt');
  const [amount, setAmount] = useState('');
  const [voucherDate, setVoucherDate] = useState('');
  const [party, setParty] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/vouchers', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!voucherType) e['voucherType'] = 'نوع السند مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!voucherDate) e['voucherDate'] = 'التاريخ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        voucherType: voucherType || undefined,
        amount: amount || undefined,
        voucherDate: voucherDate || undefined,
        party: party || undefined,
        paymentMethod: paymentMethod || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'سند قبض/صرف جديد' }} />

      <GCard style={styles.card}>
        <GSelect label="نوع السند *" value={voucherType} onChange={setVoucherType} options={VOUCHERTYPE_OPTIONS} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <DateInput label="التاريخ *" value={voucherDate} onChange={setVoucherDate} error={errors["voucherDate"]} />
        <GInput label="الجهة" value={party} onChangeText={setParty} placeholder="اسم الجهة" />
        <GSelect label="طريقة الدفع" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENTMETHOD_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={description} onChangeText={setDescription} placeholder="بيان السند" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
