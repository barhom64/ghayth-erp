/**
 * مالك عقار جديد
 * POST /api/properties/owners
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const OWNER_TYPES = [
  { label: 'فرد', value: 'individual' },
  { label: 'شركة', value: 'company' },
];

export default function OwnerNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/properties/owners', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'الاسم مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        type,
        phone: phone || undefined,
        email: email || undefined,
        idNumber: idNumber || undefined,
        bankAccount: bankAccount || undefined,
        bankName: bankName || undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة المالك بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مالك جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>البيانات الأساسية</Text>
        <GInput label="الاسم الكامل *" value={name} onChangeText={setName} placeholder="أدخل الاسم" error={errors.name} />
        <GSelect label="نوع المالك" value={type} onChange={setType} options={OWNER_TYPES} />
        <GInput label="رقم الجوال" value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" keyboardType="phone-pad" />
        <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />
        <GInput label="رقم الهوية / السجل" value={idNumber} onChangeText={setIdNumber} placeholder="أدخل رقم الهوية" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>البيانات البنكية</Text>
        <GInput label="اسم البنك" value={bankName} onChangeText={setBankName} placeholder="البنك الأهلي" />
        <GInput label="رقم الحساب / الآيبان" value={bankAccount} onChangeText={setBankAccount} placeholder="SA..." />
      </GCard>

      <GButton title="إضافة المالك" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
