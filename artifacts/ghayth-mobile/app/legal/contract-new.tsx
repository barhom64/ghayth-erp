/**
 * عقد قانوني جديد
 * POST /api/legal/contracts
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const CONTRACTTYPE_OPTIONS = [
  { label: 'تجاري', value: 'commercial' },
  { label: 'خدمات', value: 'services' },
  { label: 'إيجار', value: 'lease' },
  { label: 'شراء', value: 'purchase' },
  { label: 'غيره', value: 'other' },
];

export default function عقدقانونيجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [contractType, setContractType] = useState('commercial');
  const [otherParty, setOtherParty] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/legal/contracts', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title) e['title'] = 'عنوان العقد مطلوب';
    if (!contractType) e['contractType'] = 'نوع العقد مطلوب';
    if (!otherParty) e['otherParty'] = 'الطرف الآخر مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title || undefined,
        contractType: contractType || undefined,
        otherParty: otherParty || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        value: value || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عقد قانوني جديد' }} />

      <GCard style={styles.card}>
        <GInput label="عنوان العقد *" value={title} onChangeText={setTitle} placeholder="عنوان العقد" error={errors["title"]} />
        <GSelect label="نوع العقد *" value={contractType} onChange={setContractType} options={CONTRACTTYPE_OPTIONS} />
        <GInput label="الطرف الآخر *" value={otherParty} onChangeText={setOtherParty} placeholder="اسم الطرف الآخر" error={errors["otherParty"]} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GInput label="القيمة التعاقدية" value={value} onChangeText={setValue} placeholder="المبلغ" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
