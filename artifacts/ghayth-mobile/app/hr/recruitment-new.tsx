/**
 * إعلان وظيفي جديد — POST /api/hr/recruitments
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const JOB_TYPES = [
  { value: 'full_time', label: 'دوام كامل' },
  { value: 'part_time', label: 'دوام جزئي' },
  { value: 'contract', label: 'عقد مؤقت' },
  { value: 'internship', label: 'تدريب' },
];

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'مبتدئ (0–2 سنة)' },
  { value: 'junior', label: 'مساعد (2–4 سنوات)' },
  { value: 'mid', label: 'متوسط (4–7 سنوات)' },
  { value: 'senior', label: 'أول (7+ سنوات)' },
  { value: 'lead', label: 'قيادي' },
];

const GENDERS = [
  { value: 'any', label: 'لا يهم' },
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
];

interface Department { id: number; name?: string }
interface ListResp<T> { data?: T[] }

export default function RecruitmentNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [jobTitle, setJobTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [jobType, setJobType] = useState('full_time');
  const [experienceLevel, setExperienceLevel] = useState('mid');
  const [gender, setGender] = useState('any');
  const [vacancies, setVacancies] = useState('1');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');
  const [applicationDeadline, setApplicationDeadline] = useState('');
  const [requirements, setRequirements] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: depsResp } = useList<ListResp<Department>>('/api/hr/departments', { pageSize: 100 });
  const departmentOptions = (depsResp?.data ?? []).map(d => ({
    value: String(d.id),
    label: d.name ?? `قسم #${d.id}`,
  }));

  const mutation = useMutation('/api/hr/recruitments', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!jobTitle.trim()) errs.jobTitle = 'أدخل المسمى الوظيفي';
    if (!vacancies || isNaN(Number(vacancies)) || Number(vacancies) < 1) errs.vacancies = 'أدخل عدد الشواغر';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        jobTitle: jobTitle.trim(),
        jobType,
        experienceLevel,
        gender,
        vacancies: Number(vacancies),
      };
      if (departmentId) body.departmentId = Number(departmentId);
      if (minSalary) body.minSalary = Number(minSalary);
      if (maxSalary) body.maxSalary = Number(maxSalary);
      if (applicationDeadline) body.applicationDeadline = applicationDeadline;
      if (requirements) body.requirements = requirements;
      if (description) body.description = description;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/recruitments'] });
      Alert.alert('تم', 'تم نشر الإعلان الوظيفي بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر نشر الإعلان');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'إعلان وظيفي جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput label="المسمى الوظيفي *" value={jobTitle} onChangeText={setJobTitle} placeholder="مثال: مهندس برمجيات" error={errors.jobTitle} />
          <GSelect label="القسم" value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="اختر القسم..." />
          <GSelect label="نوع العمل" value={jobType} onChange={setJobType} options={JOB_TYPES} />
          <GSelect label="مستوى الخبرة" value={experienceLevel} onChange={setExperienceLevel} options={EXPERIENCE_LEVELS} />
          <GSelect label="الجنس" value={gender} onChange={setGender} options={GENDERS} />
          <GInput label="عدد الشواغر *" value={vacancies} onChangeText={setVacancies} keyboardType="numeric" placeholder="1" error={errors.vacancies} />
        </GCard>

        <GCard>
          <GInput label="الراتب الأدنى (ر.س)" value={minSalary} onChangeText={setMinSalary} keyboardType="numeric" placeholder="0" />
          <GInput label="الراتب الأعلى (ر.س)" value={maxSalary} onChangeText={setMaxSalary} keyboardType="numeric" placeholder="0" />
          <DateInput label="آخر موعد للتقديم" value={applicationDeadline} onChange={setApplicationDeadline} />
          <GInput label="متطلبات الوظيفة" value={requirements} onChangeText={setRequirements} placeholder="المؤهلات والمهارات المطلوبة..." multiline />
          <GInput label="وصف الوظيفة" value={description} onChangeText={setDescription} placeholder="تفاصيل المهام والمسؤوليات..." multiline />
        </GCard>

        <GButton title="نشر الإعلان الوظيفي" icon="megaphone-outline" onPress={onSubmit} loading={mutation.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
