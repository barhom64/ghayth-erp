/**
 * عقد عمل جديد
 * POST /api/hr/contracts
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const CONTRACTTYPE_OPTIONS = [
  { label: 'دوام كامل', value: 'full_time' },
  { label: 'دوام جزئي', value: 'part_time' },
  { label: 'مؤقت', value: 'temporary' },
  { label: 'تجريبي', value: 'probation' },
];

export default function عقدعملجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [employeeName, setEmployeeName] = useState('');
  const [contractType, setContractType] = useState('full_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/contracts', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!employeeName) e['employeeName'] = 'اسم الموظف مطلوب';
    if (!contractType) e['contractType'] = 'نوع العقد مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        employeeName: employeeName || undefined,
        contractType: contractType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        basicSalary: basicSalary || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عقد عمل جديد' }} />

      <GCard style={styles.card}>
        <GInput label="اسم الموظف *" value={employeeName} onChangeText={setEmployeeName} placeholder="اسم الموظف" error={errors["employeeName"]} />
        <GSelect label="نوع العقد *" value={contractType} onChange={setContractType} options={CONTRACTTYPE_OPTIONS} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GInput label="الراتب الأساسي" value={basicSalary} onChangeText={setBasicSalary} placeholder="المبلغ" />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
