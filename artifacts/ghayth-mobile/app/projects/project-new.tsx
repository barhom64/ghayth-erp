/**
 * مشروع جديد
 * POST /api/projects
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PRIORITY_OPTIONS = [
  { label: 'عالية', value: 'high' },
  { label: 'متوسطة', value: 'medium' },
  { label: 'منخفضة', value: 'low' },
];

export default function مشروعجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [priority, setPriority] = useState('high');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/projects', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم المشروع مطلوب';
    if (!clientName) e['clientName'] = 'العميل مطلوب';
    if (!priority) e['priority'] = 'الأولوية مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        clientName: clientName || undefined,
        priority: priority || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        budget: budget || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مشروع جديد' }} />
      <GCard style={styles.card}>
        <GInput label="اسم المشروع *" value={name} onChangeText={setName} placeholder="اسم المشروع" error={errors["name"]} />
        <GInput label="العميل *" value={clientName} onChangeText={setClientName} placeholder="اسم العميل" error={errors["clientName"]} />
        <GSelect label="الأولوية *" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ التسليم المتوقع" value={dueDate} onChange={setDueDate} error={errors["dueDate"]} />
        <GInput label="الميزانية" value={budget} onChangeText={setBudget} placeholder="المبلغ" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={description} onChangeText={setDescription} placeholder="وصف المشروع" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
