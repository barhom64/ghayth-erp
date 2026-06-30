/**
 * إجراء تأديبي جديد
 * POST /api/hr/discipline
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const VIOLATION_TYPES = [
  { label: 'تأخر عن العمل', value: 'late' },
  { label: 'غياب بدون إذن', value: 'absence' },
  { label: 'مخالفة اللوائح', value: 'policy_violation' },
  { label: 'سوء السلوك', value: 'misconduct' },
  { label: 'إهمال في العمل', value: 'negligence' },
  { label: 'مخالفة أمن المعلومات', value: 'security_breach' },
  { label: 'أخرى', value: 'other' },
];

const PENALTY_TYPES = [
  { label: 'تنبيه شفهي', value: 'verbal_warning' },
  { label: 'إنذار كتابي', value: 'written_warning' },
  { label: 'خصم من الراتب', value: 'salary_deduction' },
  { label: 'إيقاف عن العمل', value: 'suspension' },
  { label: 'خفض الدرجة الوظيفية', value: 'demotion' },
  { label: 'فصل من الخدمة', value: 'termination' },
];

interface Employee { id: number; name?: string; fullName?: string; empNumber?: string; }

export default function DisciplineNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { employeeId } = useLocalSearchParams<{ employeeId?: string }>();

  const [selectedEmployee, setSelectedEmployee] = useState(employeeId ?? '');
  const [violationType, setViolationType] = useState('policy_violation');
  const [penaltyType, setPenaltyType] = useState('written_warning');
  const [incidentDate, setIncidentDate] = useState('');
  const [deductionDays, setDeductionDays] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: employees } = useList<Employee[]>('/api/employees', { pageSize: 200 });
  const mutation = useMutation('/api/hr/discipline', 'POST');

  const empOptions = (Array.isArray(employees) ? employees : []).map((e: Employee) => ({
    label: e.name ?? e.fullName ?? String(e.id),
    value: String(e.id),
  }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedEmployee) e.employeeId = 'يجب اختيار الموظف';
    if (!incidentDate) e.incidentDate = 'تاريخ المخالفة مطلوب';
    if (!description.trim()) e.description = 'وصف المخالفة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeId: Number(selectedEmployee),
        violationType,
        penaltyType,
        incidentDate,
        deductionDays: penaltyType === 'salary_deduction' && deductionDays ? Number(deductionDays) : undefined,
        description: description.trim(),
      } as never);
      Alert.alert('تم', 'تم تسجيل الإجراء التأديبي', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر التسجيل');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إجراء تأديبي' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>معلومات المخالفة</Text>
        {!employeeId && empOptions.length > 0 && (
          <GSelect label="الموظف *" value={selectedEmployee} onChange={setSelectedEmployee} options={empOptions} placeholder="اختر الموظف" error={errors.employeeId} />
        )}
        <DateInput label="تاريخ المخالفة *" value={incidentDate} onChange={setIncidentDate} error={errors.incidentDate} />
        <GSelect label="نوع المخالفة" value={violationType} onChange={setViolationType} options={VIOLATION_TYPES} />
        <GSelect label="نوع الجزاء" value={penaltyType} onChange={setPenaltyType} options={PENALTY_TYPES} />
        {penaltyType === 'salary_deduction' && (
          <GInput label="أيام الخصم" value={deductionDays} onChangeText={setDeductionDays} placeholder="عدد أيام الخصم" keyboardType="numeric" />
        )}
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>وصف المخالفة</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="اكتب وصفًا تفصيليًا للمخالفة…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 100, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
        {errors.description ? <Text style={{ color: '#EF4444', textAlign: 'right', fontSize: 12 }}>{errors.description}</Text> : null}
      </GCard>

      <GButton title="تسجيل الإجراء التأديبي" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
