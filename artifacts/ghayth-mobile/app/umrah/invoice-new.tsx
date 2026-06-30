/**
 * فاتورة عمرة جديدة
 * POST /api/umrah/invoices
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
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

export default function فاتورةعمرةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [groupName, setGroupName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/invoices', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!groupName) e['groupName'] = 'اسم المجموعة مطلوب';
    if (!totalAmount) e['totalAmount'] = 'المبلغ الإجمالي مطلوب';
    if (!invoiceDate) e['invoiceDate'] = 'تاريخ الفاتورة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        groupName: groupName || undefined,
        totalAmount: totalAmount || undefined,
        invoiceDate: invoiceDate || undefined,
        status: status || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فاتورة عمرة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="اسم المجموعة *" value={groupName} onChangeText={setGroupName} placeholder="اسم مجموعة العمرة" error={errors["groupName"]} />
        <GInput label="المبلغ الإجمالي *" value={totalAmount} onChangeText={setTotalAmount} placeholder="المبلغ" error={errors["totalAmount"]} />
        <DateInput label="تاريخ الفاتورة *" value={invoiceDate} onChange={setInvoiceDate} error={errors["invoiceDate"]} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
