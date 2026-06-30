/**
 * إضافة مرحلة جديدة لمشروع
 * POST /api/projects/milestones
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STATUS_OPTIONS = [
  { label: 'لم تبدأ', value: 'not_started' },
  { label: 'جارية', value: 'in_progress' },
  { label: 'مكتملة', value: 'completed' },
  { label: 'متأخرة', value: 'delayed' },
];

export default function MilestoneNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('not_started');
  const [dueDate, setDueDate] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/projects/milestones', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان المرحلة مطلوب';
    if (!projectId) e.projectId = 'معرف المشروع مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        projectId: Number(projectId),
        title: title.trim(),
        status,
        dueDate: dueDate || undefined,
        budget: budget ? Number(budget) : undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة المرحلة بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة المرحلة');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مرحلة جديدة' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل المرحلة</Text>
        <GInput label="عنوان المرحلة *" value={title} onChangeText={setTitle} placeholder="أدخل عنوان المرحلة" error={errors.title} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <DateInput label="تاريخ الاستحقاق" value={dueDate} onChange={setDueDate} />
        <GInput label="الميزانية (ر.س)" value={budget} onChangeText={setBudget} placeholder="0.00" keyboardType="numeric" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="وصف المرحلة…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      {errors.projectId ? (
        <View style={{ padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
          <Text style={{ color: '#EF4444', textAlign: 'right' }}>{errors.projectId}</Text>
        </View>
      ) : null}

      <GButton title="إضافة المرحلة" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
