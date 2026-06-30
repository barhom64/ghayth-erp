/**
 * طلب سلفة جديد (self-service) — يُرسل إلى POST /api/hr/loans
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useMutation } from '@/hooks/useApi';

const LOAN_TYPES = [
  { value: 'personal', label: 'شخصية' },
  { value: 'emergency', label: 'طارئة' },
  { value: 'housing', label: 'سكنية' },
  { value: 'other', label: 'أخرى' },
];

export default function LoanNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, assignments } = useAuth();

  const activeAssignment = assignments.find(a => a.companyId === user?.companyId);
  const assignmentId = activeAssignment?.id ?? null;

  const [amount, setAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState('');
  const [loanType, setLoanType] = useState('personal');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/loans', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) errs.amount = 'أدخل مبلغًا صحيحًا';
    const inst = Number(installmentCount);
    if (!installmentCount || isNaN(inst) || inst < 1 || inst > 60) errs.installmentCount = 'عدد الأقساط بين 1 و60';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    if (!assignmentId) {
      Alert.alert('خطأ', 'تعذّر تحديد تعيينك الحالي. تحقق من حسابك.');
      return;
    }
    try {
      await mutation.mutateAsync({
        assignmentId,
        amount: Number(amount),
        installmentCount: Number(installmentCount),
        loanType,
        reason: reason || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/loans'] });
      qc.invalidateQueries({ queryKey: ['/api/my-space'] });
      Alert.alert('تم', 'تم إرسال طلب السلفة للاعتماد', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب سلفة جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GText variant="caption" color={c.textMuted} style={{ textAlign: 'right', marginBottom: 16 }}>
            أدخل تفاصيل طلب السلفة وسيُرسَل للاعتماد
          </GText>

          <GInput
            label="المبلغ المطلوب *"
            value={amount}
            onChangeText={setAmount}
            placeholder="مثال: 5000"
            keyboardType="numeric"
            error={errors.amount}
          />
          <GInput
            label="عدد الأقساط *"
            value={installmentCount}
            onChangeText={setInstallmentCount}
            placeholder="مثال: 12"
            keyboardType="numeric"
            error={errors.installmentCount}
          />

          <GSelect
            label="نوع السلفة"
            value={loanType}
            onChange={setLoanType}
            options={LOAN_TYPES}
          />

          <GInput
            label="السبب"
            value={reason}
            onChangeText={setReason}
            placeholder="اكتب سبب طلب السلفة (اختياري)"
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

const styles = StyleSheet.create({ container: { padding: 16 } });
