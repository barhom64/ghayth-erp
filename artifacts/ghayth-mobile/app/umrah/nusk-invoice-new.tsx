/**
 * فاتورة نسك جديدة
 * POST /api/umrah/nusk-invoices
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function فاتورةنسكجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [packageName, setPackageName] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [pilgrimsCount, setPilgrimsCount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/nusk-invoices', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!packageName) e['packageName'] = 'نوع الباقة مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!invoiceDate) e['invoiceDate'] = 'تاريخ الفاتورة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        packageName: packageName || undefined,
        amount: amount || undefined,
        invoiceDate: invoiceDate || undefined,
        pilgrimsCount: pilgrimsCount || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فاتورة نسك جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="نوع الباقة *" value={packageName} onChangeText={setPackageName} placeholder="نوع الباقة" error={errors["packageName"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <DateInput label="تاريخ الفاتورة *" value={invoiceDate} onChange={setInvoiceDate} error={errors["invoiceDate"]} />
        <GInput label="عدد الحجاج" value={pilgrimsCount} onChangeText={setPilgrimsCount} placeholder="العدد" />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
