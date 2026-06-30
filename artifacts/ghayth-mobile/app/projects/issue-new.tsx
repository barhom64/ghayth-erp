/**
 * مشكلة / طلب تغيير جديد
 * POST /api/projects/issues
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const ISSUE_TYPES = [
  { label: 'عيب / خلل', value: 'bug' },
  { label: 'طلب تغيير', value: 'change_request' },
  { label: 'مشكلة تقنية', value: 'technical' },
  { label: 'تأخير', value: 'delay' },
  { label: 'ميزانية', value: 'budget' },
  { label: 'أخرى', value: 'other' },
];

const PRIORITY_OPTIONS = [
  { label: 'حرجة', value: 'critical' },
  { label: 'عالية', value: 'high' },
  { label: 'متوسطة', value: 'medium' },
  { label: 'منخفضة', value: 'low' },
];

const STATUS_OPTIONS = [
  { label: 'مفتوحة', value: 'open' },
  { label: 'قيد المعالجة', value: 'in_progress' },
  { label: 'مغلقة', value: 'closed' },
];

export default function IssueNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('bug');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('open');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/projects/issues', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان المشكلة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title.trim(),
        type,
        priority,
        status,
        description: description || undefined,
        projectId: projectId ? Number(projectId) : undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل المشكلة', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مشكلة جديدة' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل المشكلة</Text>
        <GInput label="العنوان *" value={title} onChangeText={setTitle} placeholder="وصف موجز للمشكلة" error={errors.title} />
        <GSelect label="النوع" value={type} onChange={setType} options={ISSUE_TYPES} />
        <GSelect label="الأولوية" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>الوصف</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="وصف تفصيلي للمشكلة…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 100, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton title="تسجيل المشكلة" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
