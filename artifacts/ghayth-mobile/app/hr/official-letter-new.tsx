/**
 * خطاب رسمي جديد
 * POST /api/hr/official-letters
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const LETTERTYPE_OPTIONS = [
  { label: 'خطاب خبرة', value: 'experience' },
  { label: 'تعريف بالراتب', value: 'salary' },
  { label: 'إجازة', value: 'leave' },
  { label: 'غيره', value: 'other' },
];

export default function خطابرسميجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [letterType, setLetterType] = useState('experience');
  const [addressedTo, setAddressedTo] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/official-letters', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!letterType) e['letterType'] = 'نوع الخطاب مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        letterType: letterType || undefined,
        addressedTo: addressedTo || undefined,
        purpose: purpose || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'خطاب رسمي جديد' }} />

      <GCard style={styles.card}>
        <GSelect label="نوع الخطاب *" value={letterType} onChange={setLetterType} options={LETTERTYPE_OPTIONS} />
        <GInput label="موجّه إلى" value={addressedTo} onChangeText={setAddressedTo} placeholder="جهة التوجيه" />
        <GInput label="الغرض" value={purpose} onChangeText={setPurpose} placeholder="الغرض من الخطاب" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات إضافية" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
