/**
 * احتساب مكافأة نهاية خدمة
 * POST /api/hr/gratuities
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const REASON_OPTIONS = [
  { label: 'استقالة', value: 'resignation' },
  { label: 'فصل', value: 'termination' },
  { label: 'انتهاء عقد', value: 'contract_end' },
  { label: 'تقاعد', value: 'retirement' },
];

export default function احتسابمكافأةنهايةخدمةScreen() {
  const c = useColors();
  const router = useRouter();

  const [employeeName, setEmployeeName] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('resignation');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/gratuities', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeName) e['employeeName'] = 'اسم الموظف مطلوب';
    if (!endDate) e['endDate'] = 'تاريخ الانتهاء مطلوب';
    if (!reason) e['reason'] = 'سبب الإنهاء مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeName: employeeName || undefined,
        endDate: endDate || undefined,
        reason: reason || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'احتساب مكافأة نهاية خدمة' }} />

      <GCard style={styles.card}>
        <GInput label="اسم الموظف *" value={employeeName} onChangeText={setEmployeeName} placeholder="اسم الموظف" error={errors["employeeName"]} />
        <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GSelect label="سبب الإنهاء *" value={reason} onChange={setReason} options={REASON_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
