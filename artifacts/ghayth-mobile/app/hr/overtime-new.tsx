/**
 * طلب وقت إضافي — يُرسل إلى POST /api/hr/overtime
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GText, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useMutation } from '@/hooks/useApi';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default function OvertimeNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [overtimeDate, setOvertimeDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { assignments } = useAuth();
  const activeAssignment = assignments.find(a => a.companyId === user?.companyId);
  const mutation = useMutation('/api/hr/overtime', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!DATE_RE.test(overtimeDate)) errs.overtimeDate = 'التاريخ يجب أن يكون YYYY-MM-DD';
    if (!TIME_RE.test(startTime)) errs.startTime = 'وقت البداية يجب أن يكون HH:MM';
    if (!TIME_RE.test(endTime)) errs.endTime = 'وقت الانتهاء يجب أن يكون HH:MM';
    const h = Number(hours);
    if (!hours || isNaN(h) || h <= 0 || h > 12) errs.hours = 'عدد ساعات صحيح (1-12)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        assignmentId: activeAssignment?.id ?? user?.id,
        overtimeDate,
        startTime,
        endTime,
        hours: Number(hours),
        reason: reason || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/overtime'] });
      Alert.alert('تم', 'تم إرسال طلب الوقت الإضافي للاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب وقت إضافي' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GText variant="caption" color={c.textMuted} style={{ textAlign: 'right', marginBottom: 16 }}>
            أدخل تفاصيل الوقت الإضافي للحصول على اعتماد المدير
          </GText>

          <GInput
            label="تاريخ العمل الإضافي *"
            value={overtimeDate}
            onChangeText={setOvertimeDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            error={errors.overtimeDate}
          />
          <GInput
            label="وقت البداية *"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="17:00"
            keyboardType="numbers-and-punctuation"
            error={errors.startTime}
          />
          <GInput
            label="وقت الانتهاء *"
            value={endTime}
            onChangeText={setEndTime}
            placeholder="20:00"
            keyboardType="numbers-and-punctuation"
            error={errors.endTime}
          />
          <GInput
            label="عدد الساعات *"
            value={hours}
            onChangeText={setHours}
            placeholder="3"
            keyboardType="numeric"
            error={errors.hours}
          />
          <GInput
            label="السبب"
            value={reason}
            onChangeText={setReason}
            placeholder="اكتب سبب الوقت الإضافي (اختياري)"
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
