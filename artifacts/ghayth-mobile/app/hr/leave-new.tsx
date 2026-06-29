/**
 * طلب إجازة جديد — يُرسل إلى POST /api/hr/leave-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, useMutation } from '@/hooks/useApi';

interface LeaveType { id: number; name: string; annualDays?: number }
interface LeaveBalance { leaveTypeId: number; remaining: number; name: string }
interface PagedResponse<T> { data?: T[]; total?: number }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function LeaveNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: typesResp, isLoading: typesLoading } = useList<PagedResponse<LeaveType>>('/api/hr/leave-types');
  const { data: balancesResp } = useList<PagedResponse<LeaveBalance>>('/api/hr/leave-balance');

  const leaveTypes: LeaveType[] = typesResp?.data ?? [];
  const balanceList: LeaveBalance[] = balancesResp?.data ?? [];

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/leave-requests', 'POST');

  const leaveOptions = leaveTypes.map(t => ({
    value: String(t.id),
    label: t.name,
  }));

  const selectedBalance = balanceList.find(b => String(b.leaveTypeId) === leaveTypeId);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!leaveTypeId) errs.leaveTypeId = 'اختر نوع الإجازة';
    if (!DATE_RE.test(startDate)) errs.startDate = 'التاريخ يجب أن يكون YYYY-MM-DD';
    if (!DATE_RE.test(endDate)) errs.endDate = 'التاريخ يجب أن يكون YYYY-MM-DD';
    if (startDate > endDate) errs.endDate = 'تاريخ الانتهاء يجب أن يكون بعد البداية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({ leaveTypeId: Number(leaveTypeId), startDate, endDate, reason } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/leave-requests'] });
      qc.invalidateQueries({ queryKey: ['/api/my-space'] });
      Alert.alert('تم', 'تم إرسال طلب الإجازة للاعتماد', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  if (typesLoading) return <GLoadingState text="جارٍ تحميل أنواع الإجازات…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب إجازة جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع الإجازة *"
            value={leaveTypeId}
            onChange={setLeaveTypeId}
            options={leaveOptions}
            placeholder="اختر نوع الإجازة..."
            error={errors.leaveTypeId}
          />

          {selectedBalance && (
            <GText variant="caption" color={c.brand} style={{ textAlign: 'right', marginBottom: 12 }}>
              الرصيد المتبقي: {selectedBalance.remaining} يوم
            </GText>
          )}

          <GInput
            label="تاريخ البداية *"
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            error={errors.startDate}
          />
          <GInput
            label="تاريخ الانتهاء *"
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            error={errors.endDate}
          />
          <GInput
            label="سبب الإجازة"
            value={reason}
            onChangeText={setReason}
            placeholder="اكتب سبب الإجازة (اختياري)"
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
