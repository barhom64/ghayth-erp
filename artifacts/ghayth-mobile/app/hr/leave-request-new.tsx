/**
 * طلب إجازة جديد — POST /api/hr/leave-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const LEAVE_TYPES = [
  { value: 'annual', label: 'إجازة سنوية' },
  { value: 'sick', label: 'إجازة مرضية' },
  { value: 'emergency', label: 'إجازة طارئة' },
  { value: 'maternity', label: 'إجازة أمومة' },
  { value: 'paternity', label: 'إجازة أبوة' },
  { value: 'hajj', label: 'إجازة حج' },
  { value: 'unpaid', label: 'إجازة بدون راتب' },
  { value: 'study', label: 'إجازة دراسية' },
  { value: 'bereavement', label: 'إجازة وفاة' },
];

interface LeaveBalance { leaveType: string; balance?: number; used?: number; remaining?: number }

export default function LeaveRequestNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [leaveType, setLeaveType] = useState('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: balancesResp } = useList<{ data?: LeaveBalance[] }>('/api/hr/leave-balances/my', {});
  const balances = balancesResp?.data ?? [];
  const currentBalance = balances.find(b => b.leaveType === leaveType);

  const mutation = useMutation('/api/hr/leave-requests', 'POST');

  const calcDays = () => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (e < s) return 0;
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.startDate = 'اختر تاريخ بداية الإجازة';
    if (!endDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.endDate = 'اختر تاريخ نهاية الإجازة';
    if (startDate && endDate && endDate < startDate) errs.endDate = 'تاريخ النهاية يجب أن يكون بعد البداية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    const days = calcDays();
    Alert.alert(
      'تأكيد الطلب',
      `طلب إجازة ${LEAVE_TYPES.find(t => t.value === leaveType)?.label} لمدة ${days} يوم. هل تريد المتابعة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إرسال',
          onPress: async () => {
            try {
              await mutation.mutateAsync({ leaveType, startDate, endDate, reason: reason || undefined } as never);
              qc.invalidateQueries({ queryKey: ['/api/hr/leave-requests'] });
              Alert.alert('تم', 'تم إرسال طلب الإجازة وسيتم مراجعته من قِبل مديرك', [
                { text: 'حسنًا', onPress: () => router.back() },
              ]);
            } catch (e: unknown) {
              Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
            }
          },
        },
      ]
    );
  };

  const days = calcDays();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب إجازة جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect label="نوع الإجازة" value={leaveType} onChange={setLeaveType} options={LEAVE_TYPES} />
          {currentBalance && (
            <View style={[styles.balanceRow, { backgroundColor: c.surfaceAlt, borderRadius: 8, padding: 10 }]}>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                الرصيد المتاح: <Text style={{ color: c.brand, fontWeight: '700' }}>{currentBalance.remaining ?? currentBalance.balance ?? '—'} يوم</Text>
                {currentBalance.used !== undefined ? `  |  مستخدم: ${currentBalance.used} يوم` : ''}
              </Text>
            </View>
          )}
          <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors.startDate} />
          <DateInput label="تاريخ النهاية *" value={endDate} onChange={setEndDate} minDate={startDate} error={errors.endDate} />
          {days > 0 && (
            <View style={[styles.balanceRow, { backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10 }]}>
              <Text style={{ fontSize: 13, color: '#1D4ED8', textAlign: 'right', fontWeight: '600' }}>
                مدة الإجازة: {days} يوم
              </Text>
            </View>
          )}
          <GInput
            label="سبب الإجازة"
            value={reason}
            onChangeText={setReason}
            placeholder="اذكر سبب الإجازة إن لزم..."
            multiline
          />
        </GCard>

        <GButton title="إرسال طلب الإجازة" icon="calendar-outline" onPress={onSubmit} loading={mutation.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  balanceRow: { marginVertical: 4 },
});
