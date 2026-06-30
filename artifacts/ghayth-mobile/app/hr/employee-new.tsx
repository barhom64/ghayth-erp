/**
 * إضافة موظف جديد — POST /api/hr/employees
 * العملية الأساسية: الاسم + الهوية + الدور + الراتب
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const GENDERS = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
];

const ID_TYPES = [
  { value: 'iqama', label: 'إقامة' },
  { value: 'national_id', label: 'هوية وطنية' },
  { value: 'passport', label: 'جواز سفر' },
  { value: 'gcc_id', label: 'هوية خليجية' },
];

const CONTRACT_TYPES = [
  { value: 'full_time', label: 'دوام كامل' },
  { value: 'part_time', label: 'دوام جزئي' },
  { value: 'contract', label: 'عقد مؤقت' },
  { value: 'probation', label: 'تجريبي' },
];

interface Department { id: number; name?: string }
interface Branch { id: number; name?: string }
interface JobTitle { id: number; name?: string; title?: string }
interface ListResp<T> { data?: T[] }

export default function EmployeeNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('male');
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [idExpiry, setIdExpiry] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [jobTitleId, setJobTitleId] = useState('');
  const [contractType, setContractType] = useState('full_time');
  const [hireDate, setHireDate] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: depsResp } = useList<ListResp<Department>>('/api/hr/departments', { pageSize: 100 });
  const { data: branchesResp } = useList<ListResp<Branch>>('/api/branches', { pageSize: 100 });
  const { data: titlesResp } = useList<ListResp<JobTitle>>('/api/hr/job-titles', { pageSize: 200 });

  const departmentOptions = (depsResp?.data ?? []).map(d => ({ value: String(d.id), label: d.name ?? `قسم #${d.id}` }));
  const branchOptions = (branchesResp?.data ?? []).map(b => ({ value: String(b.id), label: b.name ?? `فرع #${b.id}` }));
  const titleOptions = (titlesResp?.data ?? []).map(t => ({ value: String(t.id), label: t.name ?? t.title ?? `مسمى #${t.id}` }));

  const mutation = useMutation('/api/hr/employees', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'أدخل الاسم الأول';
    if (!lastName.trim()) errs.lastName = 'أدخل اسم العائلة';
    if (!idNumber.trim()) errs.idNumber = 'أدخل رقم الهوية';
    if (!phone.trim()) errs.phone = 'أدخل رقم الجوال';
    if (!hireDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.hireDate = 'اختر تاريخ التعيين';
    if (!basicSalary || isNaN(Number(basicSalary))) errs.basicSalary = 'أدخل الراتب الأساسي';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        idType,
        idNumber: idNumber.trim(),
        phone: phone.trim(),
        contractType,
        hireDate,
        basicSalary: Number(basicSalary),
      };
      if (idExpiry) body.idExpiry = idExpiry;
      if (email) body.email = email;
      if (departmentId) body.departmentId = Number(departmentId);
      if (branchId) body.branchId = Number(branchId);
      if (jobTitleId) body.jobTitleId = Number(jobTitleId);

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      Alert.alert('تم', 'تم إضافة الموظف بنجاح وسيتم إرسال بيانات الدخول إليه', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة الموظف');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'إضافة موظف جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput label="الاسم الأول *" value={firstName} onChangeText={setFirstName} placeholder="الاسم" error={errors.firstName} />
          <GInput label="اسم العائلة *" value={lastName} onChangeText={setLastName} placeholder="العائلة" error={errors.lastName} />
          <GSelect label="الجنس" value={gender} onChange={setGender} options={GENDERS} />
          <GSelect label="نوع الهوية" value={idType} onChange={setIdType} options={ID_TYPES} />
          <GInput label="رقم الهوية *" value={idNumber} onChangeText={setIdNumber} placeholder="1XXXXXXXXX" error={errors.idNumber} />
          <DateInput label="تاريخ انتهاء الهوية" value={idExpiry} onChange={setIdExpiry} />
          <GInput label="رقم الجوال *" value={phone} onChangeText={setPhone} placeholder="+966XXXXXXXXX" keyboardType="phone-pad" error={errors.phone} />
          <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="employee@company.com" keyboardType="email-address" />
        </GCard>

        <GCard>
          <GSelect label="القسم" value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="اختر القسم..." />
          <GSelect label="الفرع" value={branchId} onChange={setBranchId} options={branchOptions} placeholder="اختر الفرع..." />
          <GSelect label="المسمى الوظيفي" value={jobTitleId} onChange={setJobTitleId} options={titleOptions} placeholder="اختر المسمى..." />
          <GSelect label="نوع العقد" value={contractType} onChange={setContractType} options={CONTRACT_TYPES} />
          <DateInput label="تاريخ التعيين *" value={hireDate} onChange={setHireDate} error={errors.hireDate} />
          <GInput label="الراتب الأساسي (ر.س) *" value={basicSalary} onChangeText={setBasicSalary} keyboardType="numeric" placeholder="0.00" error={errors.basicSalary} />
        </GCard>

        <GButton title="إضافة الموظف" icon="person-add-outline" onPress={onSubmit} loading={mutation.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
