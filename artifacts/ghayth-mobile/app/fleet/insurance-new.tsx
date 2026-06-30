/**
 * تأمين مركبة جديد
 * POST /api/fleet/insurances
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const INSURANCETYPE_OPTIONS = [
  { label: 'شامل', value: 'comprehensive' },
  { label: 'ضد الغير', value: 'third_party' },
];

export default function تأمينمركبةجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [insuranceType, setInsuranceType] = useState('comprehensive');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [premium, setPremium] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/fleet/insurances', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!vehicleNumber) e['vehicleNumber'] = 'رقم المركبة مطلوب';
    if (!insuranceType) e['insuranceType'] = 'نوع التأمين مطلوب';
    if (!insuranceCompany) e['insuranceCompany'] = 'شركة التأمين مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    if (!endDate) e['endDate'] = 'تاريخ الانتهاء مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        vehicleNumber: vehicleNumber || undefined,
        insuranceType: insuranceType || undefined,
        insuranceCompany: insuranceCompany || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        premium: premium || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تأمين مركبة جديد' }} />

      <GCard style={styles.card}>
        <GInput label="رقم المركبة *" value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="رقم لوحة المركبة" error={errors["vehicleNumber"]} />
        <GSelect label="نوع التأمين *" value={insuranceType} onChange={setInsuranceType} options={INSURANCETYPE_OPTIONS} />
        <GInput label="شركة التأمين *" value={insuranceCompany} onChangeText={setInsuranceCompany} placeholder="اسم الشركة" error={errors["insuranceCompany"]} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GInput label="قيمة القسط" value={premium} onChangeText={setPremium} placeholder="المبلغ" />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
