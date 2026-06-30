/**
 * سياسة جديدة
 * POST /api/governance/policies
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const CATEGORY_OPTIONS = [
  { label: 'إدارية', value: 'administrative' },
  { label: 'مالية', value: 'financial' },
  { label: 'تشغيلية', value: 'operational' },
  { label: 'أمنية', value: 'security' },
];

export default function سياسةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('administrative');
  const [issueDate, setIssueDate] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/governance/policies', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title) e['title'] = 'عنوان السياسة مطلوب';
    if (!category) e['category'] = 'الفئة مطلوب';
    if (!issueDate) e['issueDate'] = 'تاريخ الإصدار مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title || undefined,
        category: category || undefined,
        issueDate: issueDate || undefined,
        nextReviewDate: nextReviewDate || undefined,
        content: content || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'سياسة جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="عنوان السياسة *" value={title} onChangeText={setTitle} placeholder="عنوان السياسة" error={errors["title"]} />
        <GSelect label="الفئة *" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        <DateInput label="تاريخ الإصدار *" value={issueDate} onChange={setIssueDate} error={errors["issueDate"]} />
        <DateInput label="تاريخ المراجعة القادمة" value={nextReviewDate} onChange={setNextReviewDate} error={errors["nextReviewDate"]} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={content} onChangeText={setContent} placeholder="محتوى السياسة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
