/**
 * عهدة جديدة
 * POST /api/finance/custodies
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function عهدةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [employeeName, setEmployeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expectedSettlementDate, setExpectedSettlementDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/custodies', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeName) e['employeeName'] = 'الموظف مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!purpose) e['purpose'] = 'الغرض مطلوب';
    if (!issueDate) e['issueDate'] = 'تاريخ الاستلام مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeName: employeeName || undefined,
        amount: amount || undefined,
        purpose: purpose || undefined,
        issueDate: issueDate || undefined,
        expectedSettlementDate: expectedSettlementDate || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عهدة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="الموظف *" value={employeeName} onChangeText={setEmployeeName} placeholder="اسم الموظف" error={errors["employeeName"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <GInput label="الغرض *" value={purpose} onChangeText={setPurpose} placeholder="الغرض من العهدة" error={errors["purpose"]} />
        <DateInput label="تاريخ الاستلام *" value={issueDate} onChange={setIssueDate} error={errors["issueDate"]} />
        <DateInput label="تاريخ التسوية المتوقع" value={expectedSettlementDate} onChange={setExpectedSettlementDate} error={errors["expectedSettlementDate"]} />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
