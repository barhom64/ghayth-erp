/**
 * صرف أصل ثابت
 * POST /api/finance/fixed-assets/disposals
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const DISPOSALMETHOD_OPTIONS = [
  { label: 'بيع', value: 'sale' },
  { label: 'إتلاف', value: 'scrap' },
  { label: 'تبرع', value: 'donation' },
  { label: 'إحالة', value: 'transfer' },
];

export default function صرفأصلثابتScreen() {
  const c = useColors();
  const router = useRouter();

  const [disposalDate, setDisposalDate] = useState('');
  const [disposalMethod, setDisposalMethod] = useState('sale');
  const [saleValue, setSaleValue] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/fixed-assets/disposals', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!disposalDate) e['disposalDate'] = 'تاريخ الصرف مطلوب';
    if (!disposalMethod) e['disposalMethod'] = 'طريقة الصرف مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        disposalDate: disposalDate || undefined,
        disposalMethod: disposalMethod || undefined,
        saleValue: saleValue || undefined,
        reason: reason || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'صرف أصل ثابت' }} />

      <GCard style={styles.card}>
        <DateInput label="تاريخ الصرف *" value={disposalDate} onChange={setDisposalDate} error={errors["disposalDate"]} />
        <GSelect label="طريقة الصرف *" value={disposalMethod} onChange={setDisposalMethod} options={DISPOSALMETHOD_OPTIONS} />
        <GInput label="قيمة البيع" value={saleValue} onChangeText={setSaleValue} placeholder="القيمة عند البيع" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={reason} onChangeText={setReason} placeholder="سبب صرف الأصل" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
