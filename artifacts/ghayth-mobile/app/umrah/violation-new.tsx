/**
 * مخالفة عمرة جديدة
 * POST /api/umrah/violations
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function مخالفةعمرةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [violationType, setViolationType] = useState('');
  const [amount, setAmount] = useState('');
  const [violationDate, setViolationDate] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/violations', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!violationType) e['violationType'] = 'نوع المخالفة مطلوب';
    if (!violationDate) e['violationDate'] = 'تاريخ المخالفة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        violationType: violationType || undefined,
        amount: amount || undefined,
        violationDate: violationDate || undefined,
        details: details || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مخالفة عمرة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="نوع المخالفة *" value={violationType} onChangeText={setViolationType} placeholder="نوع المخالفة" error={errors["violationType"]} />
        <GInput label="المبلغ" value={amount} onChangeText={setAmount} placeholder="المبلغ" />
        <DateInput label="تاريخ المخالفة *" value={violationDate} onChange={setViolationDate} error={errors["violationDate"]} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={details} onChangeText={setDetails} placeholder="تفاصيل المخالفة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
