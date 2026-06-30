/**
 * دفعة للمورد — POST /api/finance/vendor-payments
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
  { value: 'stc_pay', label: 'STC Pay' },
];

interface Vendor { id: number; name?: string; companyName?: string }
interface ListResp<T> { data?: T[] }

export default function VendorPaymentNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { vendorId: vendorIdParam } = useLocalSearchParams<{ vendorId?: string }>();

  const [vendorId, setVendorId] = useState(vendorIdParam ?? '');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendorsResp } = useList<ListResp<Vendor>>('/api/finance/vendors', { pageSize: 200 });
  const vendorOptions = (vendorsResp?.data ?? []).map(v => ({
    value: String(v.id),
    label: v.name ?? v.companyName ?? `مورد #${v.id}`,
  }));

  const mutation = useMutation('/api/finance/vendor-payments', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendorId = 'اختر المورد';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'أدخل مبلغ الدفعة';
    if (!paymentDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.paymentDate = 'اختر تاريخ الدفع';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        vendorId: Number(vendorId),
        amount: Number(amount),
        paymentMethod,
        paymentDate,
      };
      if (referenceNumber) body.referenceNumber = referenceNumber;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/vendor-payments'] });
      if (vendorId) qc.invalidateQueries({ queryKey: [`/api/finance/vendors/${vendorId}`] });
      Alert.alert('تم', 'تم تسجيل الدفعة للمورد بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الدفعة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'دفعة للمورد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect label="المورد *" value={vendorId} onChange={setVendorId} options={vendorOptions} placeholder="اختر المورد..." error={errors.vendorId} />
          <GInput label="المبلغ (ر.س) *" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" error={errors.amount} />
          <GSelect label="طريقة الدفع" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
          <DateInput label="تاريخ الدفع *" value={paymentDate} onChange={setPaymentDate} error={errors.paymentDate} />
          <GInput label="رقم المرجع / الشيك" value={referenceNumber} onChangeText={setReferenceNumber} placeholder="رقم التحويل أو الشيك..." />
          <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="أي ملاحظات إضافية..." multiline />
          <GButton title="تسجيل الدفعة" icon="card-outline" onPress={onSubmit} loading={mutation.isPending} style={{ marginTop: 8 }} />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
