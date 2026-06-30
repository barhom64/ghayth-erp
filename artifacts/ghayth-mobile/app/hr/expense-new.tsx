/**
 * طلب مصروف جديد — يُرسل إلى POST /api/finance/expenses
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';
import { takePhoto } from '@/hooks/useNative';
import type { PhotoResult } from '@/hooks/useNative';

const EXPENSE_TYPES = [
  { value: 'travel', label: 'سفر وتنقل' },
  { value: 'accommodation', label: 'إقامة' },
  { value: 'meals', label: 'وجبات' },
  { value: 'fuel', label: 'وقود' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'communication', label: 'اتصالات' },
  { value: 'office_supplies', label: 'مستلزمات مكتبية' },
  { value: 'entertainment', label: 'ضيافة واستقبال' },
  { value: 'other', label: 'أخرى' },
];

export default function ExpenseNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [expenseType, setExpenseType] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<PhotoResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/expenses', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!expenseType) errs.expenseType = 'اختر نوع المصروف';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errs.amount = 'أدخل مبلغًا صحيحًا';
    if (!expenseDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.expenseDate = 'اختر تاريخ الصرف';
    if (!description.trim()) errs.description = 'أدخل وصف المصروف';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAttachReceipt = async () => {
    const photo = await takePhoto();
    if (photo) setReceiptPhoto(photo);
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        expenseType,
        amount: Number(amount),
        expenseDate,
        description,
      };
      if (receiptPhoto) body.receiptBase64 = receiptPhoto.base64;
      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/expenses'] });
      Alert.alert('تم', 'تم إرسال طلب المصروف للاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب مصروف جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع المصروف *"
            value={expenseType}
            onChange={setExpenseType}
            options={EXPENSE_TYPES}
            placeholder="اختر نوع المصروف..."
            error={errors.expenseType}
          />

          <GInput
            label="المبلغ (ريال) *"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0.00"
            error={errors.amount}
          />

          <DateInput
            label="تاريخ الصرف *"
            value={expenseDate}
            onChange={setExpenseDate}
            error={errors.expenseDate}
          />

          <GInput
            label="وصف المصروف *"
            value={description}
            onChangeText={setDescription}
            placeholder="اكتب وصفًا تفصيليًا للمصروف"
            multiline

            error={errors.description}
          />

          {/* إرفاق الإيصال */}
          <View style={styles.receiptRow}>
            <GButton
              title={receiptPhoto ? 'تم إرفاق الإيصال ✓' : 'إرفاق إيصال (صورة)'}
              icon="camera-outline"
              variant="secondary"
              onPress={handleAttachReceipt}
              style={{ flex: 1 }}
            />
          </View>
          {receiptPhoto ? (
            <Text style={{ fontSize: 12, color: '#22C55E', textAlign: 'right' }}>
              تم التقاط صورة الإيصال بنجاح
            </Text>
          ) : null}

          <GButton
            title="إرسال الطلب"
            icon="send-outline"
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
  receiptRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
