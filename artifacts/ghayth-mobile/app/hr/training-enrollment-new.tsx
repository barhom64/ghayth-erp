/**
 * تسجيل مشاركة تدريب
 * POST /api/hr/training/enrollments
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STATUS_OPTIONS = [
  { label: 'مسجل', value: 'enrolled' },
  { label: 'مكتمل', value: 'completed' },
  { label: 'غائب', value: 'absent' },
];

export default function تسجيلمشاركةتدريبScreen() {
  const c = useColors();
  const router = useRouter();

  const [employeeName, setEmployeeName] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState('');
  const [status, setStatus] = useState('enrolled');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/training/enrollments', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeName) e['employeeName'] = 'اسم الموظف مطلوب';
    if (!enrollmentDate) e['enrollmentDate'] = 'تاريخ التسجيل مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeName: employeeName || undefined,
        enrollmentDate: enrollmentDate || undefined,
        status: status || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تسجيل مشاركة تدريب' }} />

      <GCard style={styles.card}>
        <GInput label="اسم الموظف *" value={employeeName} onChangeText={setEmployeeName} placeholder="اسم الموظف" error={errors["employeeName"]} />
        <DateInput label="تاريخ التسجيل *" value={enrollmentDate} onChange={setEnrollmentDate} error={errors["enrollmentDate"]} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
