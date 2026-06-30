/**
 * إنشاء مهمة مشروع جديدة — POST /api/projects/tasks
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PRIORITIES = [
  { value: 'critical', label: 'حرجة' },
  { value: 'high', label: 'عالية' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low', label: 'منخفضة' },
];

interface Project { id: number; name?: string; title?: string }
interface Employee { id: number; name?: string; fullName?: string }
interface ListResp<T> { data?: T[] }

export default function TaskNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId?: string }>();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projectIdParam ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: projectsResp } = useList<ListResp<Project>>('/api/projects', { pageSize: 100 });
  const { data: employeesResp } = useList<ListResp<Employee>>('/api/hr/employees', { pageSize: 100 });

  const projectOptions = (projectsResp?.data ?? []).map(p => ({
    value: String(p.id),
    label: p.name ?? p.title ?? `مشروع #${p.id}`,
  }));
  const employeeOptions = (employeesResp?.data ?? []).map(e => ({
    value: String(e.id),
    label: e.name ?? e.fullName ?? `موظف #${e.id}`,
  }));

  const mutation = useMutation('/api/projects/tasks', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان المهمة';
    if (!projectId) errs.projectId = 'اختر المشروع';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        projectId: Number(projectId),
        priority,
      };
      if (assigneeId) body.assigneeId = Number(assigneeId);
      if (dueDate) body.dueDate = dueDate;
      if (estimatedHours) body.estimatedHours = Number(estimatedHours);
      if (description) body.description = description;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/projects/tasks'] });
      if (projectId) qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      Alert.alert('تم', 'تم إنشاء المهمة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء المهمة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'مهمة جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان المهمة *"
            value={title}
            onChangeText={setTitle}
            placeholder="ماذا يجب تنفيذه؟"
            error={errors.title}
          />

          <GSelect
            label="المشروع *"
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            placeholder="اختر المشروع..."
            error={errors.projectId}
          />

          <GSelect
            label="المسؤول"
            value={assigneeId}
            onChange={setAssigneeId}
            options={employeeOptions}
            placeholder="اختر الموظف المسؤول..."
          />

          <GSelect
            label="الأولوية"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES}
          />

          <DateInput
            label="تاريخ الاستحقاق"
            value={dueDate}
            onChange={setDueDate}
          />

          <GInput
            label="الساعات المقدّرة"
            value={estimatedHours}
            onChangeText={setEstimatedHours}
            keyboardType="numeric"
            placeholder="0"
          />

          <GInput
            label="الوصف"
            value={description}
            onChangeText={setDescription}
            placeholder="تفاصيل المهمة ومعايير الإتمام..."
            multiline
          />

          <GButton
            title="إنشاء المهمة"
            icon="checkmark-circle-outline"
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
