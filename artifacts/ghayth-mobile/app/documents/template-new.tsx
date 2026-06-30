/**
 * قالب وثيقة جديد
 * POST /api/documents/templates
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const CATEGORY_OPTIONS = [
  { label: 'عقود', value: 'contracts' },
  { label: 'خطابات', value: 'letters' },
  { label: 'تقارير', value: 'reports' },
  { label: 'نماذج', value: 'forms' },
];

export default function قالبوثيقةجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('contracts');
  const [language, setLanguage] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/documents/templates', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم القالب مطلوب';
    if (!category) e['category'] = 'الفئة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        category: category || undefined,
        language: language || undefined,
        content: content || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'قالب وثيقة جديد' }} />

      <GCard style={styles.card}>
        <GInput label="اسم القالب *" value={name} onChangeText={setName} placeholder="اسم القالب" error={errors["name"]} />
        <GSelect label="الفئة *" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        <GInput label="اللغة" value={language} onChangeText={setLanguage} placeholder="اللغة" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={content} onChangeText={setContent} placeholder="محتوى القالب" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
