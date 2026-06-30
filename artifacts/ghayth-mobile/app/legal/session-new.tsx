/**
 * إضافة جلسة تقاضي جديدة
 * POST /api/legal/sessions
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const SESSION_RESULTS = [
  { label: 'مؤجّلة', value: 'adjourned' },
  { label: 'منظورة', value: 'heard' },
  { label: 'صدر حكم', value: 'judgment_issued' },
  { label: 'انتهت', value: 'closed' },
];

export default function SessionNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();

  const [hearingDate, setHearingDate] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [court, setCourt] = useState('');
  const [judge, setJudge] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/legal/sessions', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!caseId) e.caseId = 'معرف القضية مطلوب';
    if (!hearingDate) e.hearingDate = 'تاريخ الجلسة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        caseId: Number(caseId),
        hearingDate,
        nextDate: nextDate || undefined,
        court: court || undefined,
        judge: judge || undefined,
        result: result || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل الجلسة بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الجلسة');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'جلسة تقاضي جديدة' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل الجلسة</Text>
        <DateInput
          label="تاريخ الجلسة *"
          value={hearingDate}
          onChange={setHearingDate}
          error={errors.hearingDate}
        />
        <DateInput
          label="تاريخ الجلسة القادمة"
          value={nextDate}
          onChange={setNextDate}
          minDate={hearingDate || undefined}
        />
        <GInput
          label="المحكمة"
          value={court}
          onChangeText={setCourt}
          placeholder="اسم المحكمة"
        />
        <GInput
          label="القاضي"
          value={judge}
          onChangeText={setJudge}
          placeholder="اسم القاضي"
        />
        <GSelect
          label="نتيجة الجلسة"
          value={result}
          onChange={setResult}
          options={SESSION_RESULTS}
          placeholder="اختر نتيجة الجلسة"
        />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>ملاحظات</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="أدخل ملاحظات الجلسة…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      {errors.caseId ? (
        <View style={{ padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
          <Text style={{ color: '#EF4444', textAlign: 'right' }}>{errors.caseId}</Text>
        </View>
      ) : null}

      <GButton
        title="تسجيل الجلسة"
        onPress={handleSubmit}
        loading={mutation.isPending}
        style={{ marginTop: 4 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 80 },
});
