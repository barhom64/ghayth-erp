/**
 * سائق جديد
 * POST /api/fleet/drivers
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const LICENSETYPE_OPTIONS = [
  { label: 'خاصة', value: 'private' },
  { label: 'تجارية', value: 'commercial' },
  { label: 'ثقيلة', value: 'heavy' },
];

export default function سائقجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [licenseType, setLicenseType] = useState('private');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/fleet/drivers', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName) e['fullName'] = 'الاسم الكامل مطلوب';
    if (!phone) e['phone'] = 'رقم الجوال مطلوب';
    if (!licenseNumber) e['licenseNumber'] = 'رقم رخصة القيادة مطلوب';
    if (!licenseType) e['licenseType'] = 'نوع الرخصة مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        fullName: fullName || undefined,
        phone: phone || undefined,
        idNumber: idNumber || undefined,
        licenseNumber: licenseNumber || undefined,
        licenseExpiry: licenseExpiry || undefined,
        licenseType: licenseType || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'سائق جديد' }} />
      <GCard style={styles.card}>
        <GInput label="الاسم الكامل *" value={fullName} onChangeText={setFullName} placeholder="الاسم الكامل" error={errors["fullName"]} />
        <GInput label="رقم الجوال *" value={phone} onChangeText={setPhone} placeholder="رقم الجوال" error={errors["phone"]} />
        <GInput label="رقم الهوية" value={idNumber} onChangeText={setIdNumber} placeholder="رقم الهوية أو الإقامة" />
        <GInput label="رقم رخصة القيادة *" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="رقم الرخصة" error={errors["licenseNumber"]} />
        <DateInput label="تاريخ انتهاء الرخصة" value={licenseExpiry} onChange={setLicenseExpiry} error={errors["licenseExpiry"]} />
        <GSelect label="نوع الرخصة *" value={licenseType} onChange={setLicenseType} options={LICENSETYPE_OPTIONS} />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
