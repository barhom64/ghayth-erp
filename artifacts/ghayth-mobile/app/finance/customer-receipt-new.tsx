/**
 * إيصال دفعة عميل — POST /api/finance/customer-receipts
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'check', label: 'شيك' },
  { value: 'cash', label: 'نقدًا' },
  { value: 'sadad', label: 'سداد' },
  { value: 'mada', label: 'مدى' },
  { value: 'visa', label: 'فيزا' },
  { value: 'stc_pay', label: 'STC Pay' },
];

interface Client { id: number; name?: string; fullName?: string }
interface ListResp<T> { data?: T[] }

export default function CustomerReceiptNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { clientId: clientIdParam } = useLocalSearchParams<{ clientId?: string }>();

  const [clientId, setClientId] = useState(clientIdParam ?? '');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [receiptDate, setReceiptDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: clientsResp } = useList<ListResp<Client>>('/api/clients', { pageSize: 200 });
  const clientOptions = (clientsResp?.data ?? []).map(cl => ({
    value: String(cl.id),
    label: cl.name ?? cl.fullName ?? `عميل #${cl.id}`,
  }));

  const mutation = useMutation('/api/finance/customer-receipts', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!clientId) errs.clientId = 'اختر العميل';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'أدخل مبلغ الدفعة';
    if (!receiptDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.receiptDate = 'اختر تاريخ الاستلام';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        clientId: Number(clientId),
        amount: Number(amount),
        paymentMethod,
        receiptDate,
      };
      if (referenceNumber) body.referenceNumber = referenceNumber;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/customer-receipts'] });
      if (clientId) qc.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
      Alert.alert('تم', 'تم تسجيل إيصال الدفعة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الإيصال');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'إيصال دفعة العميل' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect label="العميل *" value={clientId} onChange={setClientId} options={clientOptions} placeholder="اختر العميل..." error={errors.clientId} />
          <GInput label="المبلغ المستلم (ر.س) *" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" error={errors.amount} />
          <GSelect label="طريقة الدفع" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
          <DateInput label="تاريخ الاستلام *" value={receiptDate} onChange={setReceiptDate} error={errors.receiptDate} />
          <GInput label="رقم المرجع" value={referenceNumber} onChangeText={setReferenceNumber} placeholder="رقم التحويل أو الشيك..." />
          <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="أي ملاحظات إضافية..." multiline />
          <GButton title="تسجيل الإيصال" icon="checkmark-circle-outline" onPress={onSubmit} loading={mutation.isPending} style={{ marginTop: 8 }} />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
