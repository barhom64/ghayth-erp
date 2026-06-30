/**
 * طلب جديد
 * POST /api/requests
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const REQUESTTYPE_OPTIONS = [
  { label: 'عام', value: 'general' },
  { label: 'مشتريات', value: 'procurement' },
  { label: 'صيانة', value: 'maintenance' },
  { label: 'تقني', value: 'technical' },
  { label: 'إداري', value: 'administrative' },
];

const PRIORITY_OPTIONS = [
  { label: 'عالية', value: 'high' },
  { label: 'متوسطة', value: 'medium' },
  { label: 'منخفضة', value: 'low' },
];

export default function طلبجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [requestType, setRequestType] = useState('general');
  const [priority, setPriority] = useState('high');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/requests', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title) e['title'] = 'عنوان الطلب مطلوب';
    if (!requestType) e['requestType'] = 'نوع الطلب مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title || undefined,
        requestType: requestType || undefined,
        priority: priority || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'طلب جديد' }} />

      <GCard style={styles.card}>
        <GInput label="عنوان الطلب *" value={title} onChangeText={setTitle} placeholder="عنوان الطلب" error={errors["title"]} />
        <GSelect label="نوع الطلب *" value={requestType} onChange={setRequestType} options={REQUESTTYPE_OPTIONS} />
        <GSelect label="الأولوية" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={description} onChangeText={setDescription} placeholder="تفاصيل الطلب" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
