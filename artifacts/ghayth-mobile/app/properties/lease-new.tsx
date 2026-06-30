/**
 * عقد إيجار جديد
 * POST /api/properties/leases
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENTFREQUENCY_OPTIONS = [
  { label: 'شهري', value: 'monthly' },
  { label: 'ربع سنوي', value: 'quarterly' },
  { label: 'نصف سنوي', value: 'semi_annual' },
  { label: 'سنوي', value: 'annual' },
];

export default function عقدإيجارجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [tenantName, setTenantName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('monthly');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/properties/leases', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!tenantName) e['tenantName'] = 'اسم المستأجر مطلوب';
    if (!unitNumber) e['unitNumber'] = 'رقم الوحدة مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    if (!endDate) e['endDate'] = 'تاريخ الانتهاء مطلوب';
    if (!monthlyRent) e['monthlyRent'] = 'الإيجار الشهري مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        tenantName: tenantName || undefined,
        unitNumber: unitNumber || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        monthlyRent: monthlyRent || undefined,
        paymentFrequency: paymentFrequency || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عقد إيجار جديد' }} />

      <GCard style={styles.card}>
        <GInput label="اسم المستأجر *" value={tenantName} onChangeText={setTenantName} placeholder="اسم المستأجر" error={errors["tenantName"]} />
        <GInput label="رقم الوحدة *" value={unitNumber} onChangeText={setUnitNumber} placeholder="رقم الوحدة" error={errors["unitNumber"]} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GInput label="الإيجار الشهري *" value={monthlyRent} onChangeText={setMonthlyRent} placeholder="المبلغ" error={errors["monthlyRent"]} />
        <GSelect label="دورية الدفع" value={paymentFrequency} onChange={setPaymentFrequency} options={PAYMENTFREQUENCY_OPTIONS} />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
