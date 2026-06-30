/**
 * حكم قضائي جديد
 * POST /api/legal/judgments
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function JudgmentNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [caseRef, setCaseRef] = useState('');
  const [court, setCourt] = useState('');
  const [judgmentDate, setJudgmentDate] = useState('');
  const [judgmentType, setJudgmentType] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/legal/judgments', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!caseRef) e['caseRef'] = 'رقم القضية مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        caseRef: caseRef || undefined,
        court: court || undefined,
        judgmentDate: judgmentDate || undefined,
        judgmentType: judgmentType || undefined,
        amount: amount || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حكم قضائي جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="رقم القضية *" value={caseRef} onChangeText={setCaseRef} placeholder="رقم القضية" error={errors["caseRef"]} />
        <GInput label="المحكمة" value={court} onChangeText={setCourt} placeholder="اسم المحكمة" />
        <DateInput label="تاريخ الحكم" value={judgmentDate} onChange={setJudgmentDate} />
        <GInput label="نوع الحكم" value={judgmentType} onChangeText={setJudgmentType} placeholder="نوع الحكم" />
        <GInput label="المبلغ" value={amount} onChangeText={setAmount} placeholder="المبلغ إن وجد" />
        <GInput label="ملاحظات" value={description} onChangeText={setDescription} placeholder="ملاحظات" />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
