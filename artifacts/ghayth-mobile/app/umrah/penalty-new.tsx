/**
 * غرامة عمرة جديدة
 * POST /api/umrah/penalties
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function غرامةعمرةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [penaltyDate, setPenaltyDate] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/penalties', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!reason) e['reason'] = 'سبب الغرامة مطلوب';
    if (!amount) e['amount'] = 'المبلغ مطلوب';
    if (!penaltyDate) e['penaltyDate'] = 'تاريخ الغرامة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        reason: reason || undefined,
        amount: amount || undefined,
        penaltyDate: penaltyDate || undefined,
        details: details || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'غرامة عمرة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="سبب الغرامة *" value={reason} onChangeText={setReason} placeholder="سبب الغرامة" error={errors["reason"]} />
        <GInput label="المبلغ *" value={amount} onChangeText={setAmount} placeholder="المبلغ" error={errors["amount"]} />
        <DateInput label="تاريخ الغرامة *" value={penaltyDate} onChange={setPenaltyDate} error={errors["penaltyDate"]} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={details} onChangeText={setDetails} placeholder="تفاصيل الغرامة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
