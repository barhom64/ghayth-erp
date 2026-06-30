/**
 * تذكرة دعم جديدة — POST /api/support/tickets
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const CATEGORIES = [
  { value: 'technical', label: 'مشكلة تقنية' },
  { value: 'billing', label: 'استفسار مالي' },
  { value: 'hr', label: 'موارد بشرية' },
  { value: 'facilities', label: 'خدمات' },
  { value: 'it', label: 'تقنية المعلومات' },
  { value: 'other', label: 'أخرى' },
];

const PRIORITIES = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'urgent', label: 'عاجلة' },
];

export default function TicketNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/support/tickets', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان التذكرة';
    if (!category) errs.category = 'اختر تصنيف التذكرة';
    if (!description.trim() || description.trim().length < 20) errs.description = 'أدخل وصفًا تفصيليًا (20 حرف على الأقل)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({ title, category, priority, description } as never);
      qc.invalidateQueries({ queryKey: ['/api/support/tickets'] });
      Alert.alert('تم', 'تم رفع التذكرة بنجاح وسيتم التواصل معك قريبًا', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر رفع التذكرة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'تذكرة دعم جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان المشكلة *"
            value={title}
            onChangeText={setTitle}
            placeholder="اكتب عنوانًا مختصرًا للمشكلة"
            error={errors.title}
          />

          <GSelect
            label="التصنيف *"
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
            placeholder="اختر تصنيف المشكلة..."
            error={errors.category}
          />

          <GSelect
            label="الأولوية"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES}
          />

          <GInput
            label="وصف المشكلة تفصيليًا *"
            value={description}
            onChangeText={setDescription}
            placeholder="اشرح المشكلة بالتفصيل: ماذا حدث؟ متى؟ ما الخطوات التي قمت بها؟"
            multiline
            error={errors.description}
          />

          <GButton
            title="رفع التذكرة"
            icon="send-outline"
            onPress={onSubmit}
            loading={mutation.isPending}
            style={{ marginTop: 8 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
