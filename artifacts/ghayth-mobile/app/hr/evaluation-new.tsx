/**
 * تقييم أداء جديد
 * POST /api/hr/evaluations
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const EVALUATION_TYPES = [
  { label: 'تقييم سنوي', value: 'annual' },
  { label: 'تقييم نصف سنوي', value: 'semi_annual' },
  { label: 'تقييم ربع سنوي', value: 'quarterly' },
  { label: 'تقييم تجريبي', value: 'probation' },
  { label: 'تقييم خاص', value: 'special' },
];

const RATING_OPTIONS = [
  { label: 'ممتاز (5)', value: '5' },
  { label: 'جيد جدًا (4)', value: '4' },
  { label: 'جيد (3)', value: '3' },
  { label: 'مقبول (2)', value: '2' },
  { label: 'ضعيف (1)', value: '1' },
];

interface Employee { id: number; name?: string; fullName?: string; empNumber?: string; }

export default function EvaluationNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { employeeId } = useLocalSearchParams<{ employeeId?: string }>();

  const [selectedEmployee, setSelectedEmployee] = useState(employeeId ?? '');
  const [evaluationType, setEvaluationType] = useState('annual');
  const [period, setPeriod] = useState('');
  const [evaluationDate, setEvaluationDate] = useState('');
  const [overallRating, setOverallRating] = useState('3');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: employees } = useList<Employee[]>('/api/employees', { pageSize: 200 });
  const mutation = useMutation('/api/hr/evaluations', 'POST');

  const empOptions = (Array.isArray(employees) ? employees : []).map((e: Employee) => ({
    label: e.name ?? e.fullName ?? String(e.id),
    value: String(e.id),
  }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedEmployee) e.employeeId = 'يجب اختيار الموظف';
    if (!period.trim()) e.period = 'الفترة مطلوبة';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeId: Number(selectedEmployee),
        evaluationType,
        period: period.trim(),
        evaluationDate: evaluationDate || undefined,
        overallRating: Number(overallRating),
        strengths: strengths || undefined,
        improvements: improvements || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم حفظ تقييم الأداء', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تقييم أداء جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>بيانات التقييم</Text>
        {!employeeId && empOptions.length > 0 && (
          <GSelect label="الموظف *" value={selectedEmployee} onChange={setSelectedEmployee} options={empOptions} placeholder="اختر الموظف" error={errors.employeeId} />
        )}
        <GInput label="الفترة *" value={period} onChangeText={setPeriod} placeholder="مثال: 2025-H1" error={errors.period} />
        <GSelect label="نوع التقييم" value={evaluationType} onChange={setEvaluationType} options={EVALUATION_TYPES} />
        <DateInput label="تاريخ التقييم" value={evaluationDate} onChange={setEvaluationDate} />
        <GSelect label="التقييم العام" value={overallRating} onChange={setOverallRating} options={RATING_OPTIONS} />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>التفاصيل</Text>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>نقاط القوة</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={strengths} onChangeText={setStrengths} placeholder="نقاط القوة…" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 70, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>نقاط التحسين</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={improvements} onChangeText={setImprovements} placeholder="جوانب تحتاج تطوير…" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 70, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
        <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>ملاحظات</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات إضافية…" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 60, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>

      <GButton title="حفظ التقييم" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
