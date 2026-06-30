/**
 * تسجيل دفعة — POST /api/finance/invoices/:id/payments
 * يُستخدم لتسجيل دفعة على فاتورة محددة
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'check', label: 'شيك' },
  { value: 'cash', label: 'نقدًا' },
  { value: 'card', label: 'بطاقة ائتمان' },
  { value: 'sadad', label: 'سداد' },
  { value: 'stc_pay', label: 'STC Pay' },
  { value: 'other', label: 'أخرى' },
];

interface Invoice {
  id: number;
  ref?: string;
  clientName?: string;
  total?: number;
  paid?: number;
  currency?: string;
}

interface InvoiceResp { data?: Invoice }

export default function PaymentNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { invoiceId } = useLocalSearchParams<{ invoiceId?: string }>();

  const { data: invResp } = useList<InvoiceResp>(invoiceId ? `/api/finance/invoices/${invoiceId}` : '', undefined, { enabled: !!invoiceId });
  const invoice = invResp?.data;
  const remaining = invoice ? (invoice.total ?? 0) - (invoice.paid ?? 0) : undefined;

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation(
    invoiceId ? `/api/finance/invoices/${invoiceId}/payments` : '/api/finance/payments',
    'POST'
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'أدخل مبلغًا صحيحًا';
    if (!paymentDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.paymentDate = 'اختر تاريخ الدفعة';
    if (!method) errs.method = 'اختر طريقة الدفع';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        amount: Number(amount),
        paymentDate,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      if (invoiceId) {
        qc.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      }
      Alert.alert('تم', 'تم تسجيل الدفعة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الدفعة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'تسجيل دفعة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        {invoice && (
          <GCard style={{ marginBottom: 4 }}>
            <GText variant="caption" color={c.textMuted}>الفاتورة</GText>
            <GText variant="subheading">{invoice.ref ?? `#${invoice.id}`}</GText>
            <GText variant="caption" color={c.textMuted}>{invoice.clientName}</GText>
            {remaining !== undefined && (
              <GText variant="label" color={remaining > 0 ? c.danger : '#22C55E'} style={{ marginTop: 4 }}>
                المتبقي: {remaining.toLocaleString('ar-SA')} {invoice.currency ?? 'ر.س'}
              </GText>
            )}
          </GCard>
        )}

        <GCard>
          <GInput
            label="المبلغ *"
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
            label="رقم المرجع / الشيك"
            value={reference}
            onChangeText={setReference}
            placeholder="رقم الحوالة أو الشيك (اختياري)"
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي ملاحظات..."
            multiline
          />

          <GButton
            title="تسجيل الدفعة"
            icon="checkmark-circle-outline"
            onPress={onSubmit}
            loading={mutation.isPending}
            style={{ marginTop: 8 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
