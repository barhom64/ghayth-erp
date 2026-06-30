/**
 * مراجعة امتثال جديدة
 * POST /api/governance/compliance-reviews
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const SCOPE_OPTIONS = [
  { label: 'مالي', value: 'financial' },
  { label: 'تشغيلي', value: 'operational' },
  { label: 'قانوني', value: 'legal' },
  { label: 'تقني', value: 'technical' },
];

const RESULT_OPTIONS = [
  { label: 'ملتزم', value: 'compliant' },
  { label: 'غير ملتزم', value: 'non_compliant' },
  { label: 'جزئي', value: 'partial' },
];

export default function مراجعةامتثالجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('financial');
  const [reviewDate, setReviewDate] = useState('');
  const [result, setResult] = useState('compliant');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/governance/compliance-reviews', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title) e['title'] = 'عنوان المراجعة مطلوب';
    if (!scope) e['scope'] = 'النطاق مطلوب';
    if (!reviewDate) e['reviewDate'] = 'تاريخ المراجعة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title || undefined,
        scope: scope || undefined,
        reviewDate: reviewDate || undefined,
        result: result || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مراجعة امتثال جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="عنوان المراجعة *" value={title} onChangeText={setTitle} placeholder="عنوان" error={errors["title"]} />
        <GSelect label="النطاق *" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        <DateInput label="تاريخ المراجعة *" value={reviewDate} onChange={setReviewDate} error={errors["reviewDate"]} />
        <GSelect label="النتيجة" value={result} onChange={setResult} options={RESULT_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات المراجعة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
