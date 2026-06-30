/**
 * مستأجر جديد
 * POST /api/properties/tenants
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const TENANT_TYPES = [
  { label: 'فرد', value: 'individual' },
  { label: 'شركة', value: 'company' },
];

const ID_TYPES = [
  { label: 'هوية وطنية', value: 'national_id' },
  { label: 'إقامة', value: 'iqama' },
  { label: 'جواز سفر', value: 'passport' },
  { label: 'سجل تجاري', value: 'commercial_reg' },
];

export default function TenantNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/properties/tenants', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'الاسم مطلوب';
    if (!phone.trim()) e.phone = 'رقم الجوال مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        type,
        phone: phone.trim(),
        email: email || undefined,
        idType,
        idNumber: idNumber || undefined,
        nationality: nationality || undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة المستأجر بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مستأجر جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>البيانات الأساسية</Text>
        <GInput label="الاسم الكامل *" value={name} onChangeText={setName} placeholder="أدخل الاسم" error={errors.name} />
        <GSelect label="نوع المستأجر" value={type} onChange={setType} options={TENANT_TYPES} />
        <GInput label="رقم الجوال *" value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" keyboardType="phone-pad" error={errors.phone} />
        <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>الهوية</Text>
        <GSelect label="نوع الهوية" value={idType} onChange={setIdType} options={ID_TYPES} />
        <GInput label="رقم الهوية" value={idNumber} onChangeText={setIdNumber} placeholder="أدخل رقم الهوية" />
        <GInput label="الجنسية" value={nationality} onChangeText={setNationality} placeholder="سعودي" />
      </GCard>

      <GButton title="إضافة المستأجر" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
