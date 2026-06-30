/**
 * طلب استئذان — يُرسل إلى POST /api/hr/excuse-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { DateInput } from '@/components/DateInput';
import { useAuth } from '@/context/AuthContext';
import { useMutation } from '@/hooks/useApi';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const EXCUSE_TYPES = [
  { value: 'late', label: 'تأخر في الحضور' },
  { value: 'early_leave', label: 'مغادرة مبكرة' },
  { value: 'absence', label: 'غياب' },
  { value: 'medical', label: 'عذر طبي' },
  { value: 'other', label: 'أخرى' },
];

export default function ExcuseNewScreen() {
  const { user, assignments } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [excuseType, setExcuseType] = useState('');
  const [excuseDate, setExcuseDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeAssignment = assignments.find(a => a.companyId === user?.companyId);
  const mutation = useMutation('/api/hr/excuse-requests', 'POST');

  const today = new Date().toISOString().slice(0, 10);

  const needsTime = excuseType === 'late' || excuseType === 'early_leave';

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!excuseType) errs.excuseType = 'اختر نوع الاستئذان';
    if (!DATE_RE.test(excuseDate)) errs.excuseDate = 'التاريخ يجب أن يكون YYYY-MM-DD';
    if (needsTime) {
      if (startTime && !TIME_RE.test(startTime)) errs.startTime = 'وقت البداية يجب أن يكون HH:MM';
      if (endTime && !TIME_RE.test(endTime)) errs.endTime = 'وقت الانتهاء يجب أن يكون HH:MM';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    if (!activeAssignment?.id) {
      Alert.alert('خطأ', 'تعذّر تحديد تعيينك الحالي. تحقق من حسابك.');
      return;
    }
    try {
      await mutation.mutateAsync({
        assignmentId: activeAssignment.id,
        excuseType,
        excuseDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        reason: reason || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/excuse-requests'] });
      qc.invalidateQueries({ queryKey: ['/api/my-space/requests'] });
      Alert.alert('تم', 'تم إرسال طلب الاستئذان للاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب استئذان' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع الاستئذان *"
            value={excuseType}
            onChange={setExcuseType}
            options={EXCUSE_TYPES}
            placeholder="اختر نوع الاستئذان..."
            error={errors.excuseType}
          />
          <DateInput
            label="تاريخ الاستئذان *"
            value={excuseDate}
            onChange={setExcuseDate}
            error={errors.excuseDate}
            maxDate={today}
          />
          {needsTime && (
            <>
              <GInput
                label="وقت البداية"
                value={startTime}
                onChangeText={setStartTime}
                placeholder="08:30"
                keyboardType="numbers-and-punctuation"
                error={errors.startTime}
              />
              <GInput
                label="وقت الانتهاء"
                value={endTime}
                onChangeText={setEndTime}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
                error={errors.endTime}
              />
            </>
          )}
          <GInput
            label="السبب"
            value={reason}
            onChangeText={setReason}
            placeholder="اكتب سبب الاستئذان (اختياري)"
            multiline
          />
          <GButton
            title="إرسال الطلب"
            icon="send-outline"
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
