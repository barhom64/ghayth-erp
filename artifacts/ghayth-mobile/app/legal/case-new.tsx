/**
 * فتح قضية قانونية جديدة — POST /api/legal/cases
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const CASE_TYPES = [
  { value: 'labor', label: 'عمالية' },
  { value: 'commercial', label: 'تجارية' },
  { value: 'civil', label: 'مدنية' },
  { value: 'criminal', label: 'جنائية' },
  { value: 'administrative', label: 'إدارية' },
  { value: 'real_estate', label: 'عقارية' },
  { value: 'intellectual_property', label: 'ملكية فكرية' },
  { value: 'other', label: 'أخرى' },
];

const COURTS = [
  { value: 'labor_court', label: 'المحكمة العمالية' },
  { value: 'commercial_court', label: 'المحكمة التجارية' },
  { value: 'general_court', label: 'المحكمة العامة' },
  { value: 'administrative_court', label: 'المحكمة الإدارية' },
  { value: 'appeals_court', label: 'محكمة الاستئناف' },
  { value: 'supreme_court', label: 'المحكمة العليا' },
];

const CASE_ROLES = [
  { value: 'plaintiff', label: 'مدّعٍ' },
  { value: 'defendant', label: 'مدّعى عليه' },
  { value: 'third_party', label: 'طرف ثالث' },
];

interface Employee { id: number; name?: string; fullName?: string }
interface ListResp<T> { data?: T[] }

export default function CaseNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState('');
  const [court, setCourt] = useState('');
  const [ourRole, setOurRole] = useState('defendant');
  const [opposingParty, setOpposingParty] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [filingDate, setFilingDate] = useState('');
  const [nextSessionDate, setNextSessionDate] = useState('');
  const [assignedLawyerId, setAssignedLawyerId] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: employeesResp } = useList<ListResp<Employee>>('/api/hr/employees', { pageSize: 100 });
  const lawyerOptions = (employeesResp?.data ?? []).map(e => ({
    value: String(e.id),
    label: e.name ?? e.fullName ?? `موظف #${e.id}`,
  }));

  const mutation = useMutation('/api/legal/cases', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان القضية';
    if (!caseType) errs.caseType = 'اختر نوع القضية';
    if (!opposingParty.trim()) errs.opposingParty = 'أدخل اسم الطرف الآخر';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        caseType,
        ourRole,
        opposingParty: opposingParty.trim(),
      };
      if (court) body.court = court;
      if (caseNumber) body.caseNumber = caseNumber;
      if (filingDate) body.filingDate = filingDate;
      if (nextSessionDate) body.nextSessionDate = nextSessionDate;
      if (assignedLawyerId) body.assignedLawyerId = Number(assignedLawyerId);
      if (claimAmount) body.claimAmount = Number(claimAmount);
      if (description) body.description = description;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/legal/cases'] });
      Alert.alert('تم', 'تم فتح القضية بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر فتح القضية');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'قضية جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان القضية *"
            value={title}
            onChangeText={setTitle}
            placeholder="وصف مختصر للقضية"
            error={errors.title}
          />

          <GSelect
            label="نوع القضية *"
            value={caseType}
            onChange={setCaseType}
            options={CASE_TYPES}
            placeholder="اختر نوع القضية..."
            error={errors.caseType}
          />

          <GSelect
            label="دورنا في القضية"
            value={ourRole}
            onChange={setOurRole}
            options={CASE_ROLES}
          />

          <GInput
            label="الطرف الآخر *"
            value={opposingParty}
            onChangeText={setOpposingParty}
            placeholder="اسم الطرف المقابل"
            error={errors.opposingParty}
          />

          <GSelect
            label="المحكمة"
            value={court}
            onChange={setCourt}
            options={COURTS}
            placeholder="اختر المحكمة..."
          />

          <GInput
            label="رقم القضية"
            value={caseNumber}
            onChangeText={setCaseNumber}
            placeholder="رقم القضية الرسمي"
          />

          <DateInput
            label="تاريخ الرفع"
            value={filingDate}
            onChange={setFilingDate}
          />

          <DateInput
            label="تاريخ الجلسة القادمة"
            value={nextSessionDate}
            onChange={setNextSessionDate}
          />

          <GSelect
            label="المحامي المعيّن"
            value={assignedLawyerId}
            onChange={setAssignedLawyerId}
            options={lawyerOptions}
            placeholder="اختر المحامي..."
          />

          <GInput
            label="قيمة المطالبة (ر.س)"
            value={claimAmount}
            onChangeText={setClaimAmount}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <GInput
            label="تفاصيل القضية"
            value={description}
            onChangeText={setDescription}
            placeholder="وصف تفصيلي للقضية وظروفها..."
            multiline
          />

          <GButton
            title="فتح القضية"
            icon="scale-outline"
            onPress={onSubmit}
            loading={mutation.isPending}
            style={{ marginTop: 8 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
