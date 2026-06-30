/**
 * طلب عذر جديد
 * POST /api/hr/excuse-requests
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const EXCUSETYPE_OPTIONS = [
  { label: 'طبي', value: 'medical' },
  { label: 'شخصي', value: 'personal' },
  { label: 'طارئ', value: 'emergency' },
  { label: 'غيره', value: 'other' },
];

export default function طلبعذرجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [excuseDate, setExcuseDate] = useState('');
  const [excuseType, setExcuseType] = useState('medical');
  const [duration, setDuration] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/excuse-requests', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!excuseDate) e['excuseDate'] = 'التاريخ مطلوب';
    if (!excuseType) e['excuseType'] = 'نوع العذر مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        excuseDate: excuseDate || undefined,
        excuseType: excuseType || undefined,
        duration: duration || undefined,
        reason: reason || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'طلب عذر جديد' }} />

      <GCard style={styles.card}>
        <DateInput label="التاريخ *" value={excuseDate} onChange={setExcuseDate} error={errors["excuseDate"]} />
        <GSelect label="نوع العذر *" value={excuseType} onChange={setExcuseType} options={EXCUSETYPE_OPTIONS} />
        <GInput label="المدة (ساعات)" value={duration} onChangeText={setDuration} placeholder="عدد الساعات" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={reason} onChangeText={setReason} placeholder="سبب طلب العذر" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
