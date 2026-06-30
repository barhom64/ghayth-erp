/**
 * مصروف جديد
 * POST /api/finance/expenses
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function ExpenseNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/expenses', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title) e['title'] = 'عنوان المصروف مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!expenseDate) e['expenseDate'] = 'التاريخ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title || undefined,
        amount: amount || undefined,
        expenseDate: expenseDate || undefined,
        category: category || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مصروف جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="عنوان المصروف *" value={title} onChangeText={setTitle} placeholder="وصف المصروف" error={errors["title"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <DateInput label="التاريخ *" value={expenseDate} onChange={setExpenseDate} error={errors["expenseDate"]} />
        <GInput label="الفئة" value={category} onChangeText={setCategory} placeholder="الفئة" />
        <GInput label="البيان" value={description} onChangeText={setDescription} placeholder="البيان" />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
