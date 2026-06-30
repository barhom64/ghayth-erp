/**
 * سلفة راتب جديدة
 * POST /api/finance/salary-advances
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

export default function سلفةراتبجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [employeeName, setEmployeeName] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/salary-advances', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeName) e['employeeName'] = 'اسم الموظف مطلوب';
    if (!requestedAmount) e['requestedAmount'] = 'المبلغ المطلوب مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeName: employeeName || undefined,
        requestedAmount: requestedAmount || undefined,
        installments: installments || undefined,
        reason: reason || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'سلفة راتب جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="اسم الموظف *" value={employeeName} onChangeText={setEmployeeName} placeholder="اسم الموظف" error={errors["employeeName"]} />
        <GInput label="المبلغ المطلوب *" value={requestedAmount} onChangeText={setRequestedAmount} placeholder="المبلغ" error={errors["requestedAmount"]} />
        <GInput label="عدد الأقساط" value={installments} onChangeText={setInstallments} placeholder="عدد الأقساط" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={reason} onChangeText={setReason} placeholder="سبب طلب السلفة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
