/**
 * نشاط متابعة جديد — POST /api/crm/activities
 * يُستخدم لتسجيل مكالمة أو اجتماع أو بريد إلكتروني مع عميل/فرصة
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const ACTIVITY_TYPES = [
  { value: 'call', label: 'مكالمة هاتفية' },
  { value: 'meeting', label: 'اجتماع' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'visit', label: 'زيارة ميدانية' },
  { value: 'demo', label: 'عرض توضيحي' },
  { value: 'follow_up', label: 'متابعة' },
  { value: 'proposal', label: 'تقديم عرض سعر' },
  { value: 'other', label: 'أخرى' },
];

const OUTCOMES = [
  { value: 'positive', label: 'إيجابي' },
  { value: 'neutral', label: 'محايد' },
  { value: 'negative', label: 'سلبي' },
  { value: 'no_answer', label: 'لا يجيب' },
  { value: 'follow_up_required', label: 'يحتاج متابعة' },
];

export default function ActivityNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ opportunityId?: string; clientId?: string }>();

  const [activityType, setActivityType] = useState('call');
  const [activityDate, setActivityDate] = useState('');
  const [outcome, setOutcome] = useState('');
  const [description, setDescription] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/crm/activities', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!activityDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.activityDate = 'اختر تاريخ النشاط';
    if (!description.trim()) errs.description = 'أدخل وصف النشاط';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        activityType,
        activityDate,
        description,
        outcome: outcome || undefined,
        nextAction: nextAction || undefined,
        nextActionDate: nextActionDate || undefined,
      };
      if (params.opportunityId) body.opportunityId = Number(params.opportunityId);
      if (params.clientId) body.clientId = Number(params.clientId);
      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/crm/activities'] });
      if (params.opportunityId) {
        qc.invalidateQueries({ queryKey: [`/api/crm/opportunities/${params.opportunityId}`] });
      }
      Alert.alert('تم', 'تم تسجيل النشاط', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'تسجيل نشاط متابعة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع النشاط"
            value={activityType}
            onChange={setActivityType}
            options={ACTIVITY_TYPES}
          />

          <DateInput
            label="تاريخ النشاط *"
            value={activityDate}
            onChange={setActivityDate}
            error={errors.activityDate}
          />

          <GInput
            label="وصف النشاط *"
            value={description}
            onChangeText={setDescription}
            placeholder="ماذا تم في هذا النشاط؟ اكتب التفاصيل..."
            multiline
            error={errors.description}
          />

          <GSelect
            label="نتيجة النشاط"
            value={outcome}
            onChange={setOutcome}
            options={OUTCOMES}
            placeholder="اختر النتيجة..."
          />

          <GInput
            label="الإجراء التالي"
            value={nextAction}
            onChangeText={setNextAction}
            placeholder="ماذا ستفعل بعد ذلك؟"
          />

          <DateInput
            label="تاريخ الإجراء التالي"
            value={nextActionDate}
            onChange={setNextActionDate}
            minDate={activityDate || undefined}
          />

          <GButton
            title="حفظ النشاط"
            icon="save-outline"
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
