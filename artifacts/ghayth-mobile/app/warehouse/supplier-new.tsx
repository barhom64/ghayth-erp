/**
 * إضافة مورد جديد
 * POST /api/warehouse/suppliers
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const PAYMENT_TERMS = [
  { label: 'نقدي', value: 'cash' },
  { label: '30 يوم', value: 'net30' },
  { label: '60 يوم', value: 'net60' },
  { label: '90 يوم', value: 'net90' },
];

export default function SupplierNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net30');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/warehouse/suppliers', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'اسم المورد مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        vatNumber: vatNumber || undefined,
        crNumber: crNumber || undefined,
        paymentTerms,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة المورد بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة المورد');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إضافة مورد جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>معلومات المورد</Text>
        <GInput label="اسم المورد *" value={name} onChangeText={setName} placeholder="أدخل اسم المورد" error={errors.name} />
        <GInput label="جهة الاتصال" value={contactPerson} onChangeText={setContactPerson} placeholder="اسم المسؤول" />
        <GInput label="الجوال" value={phone} onChangeText={setPhone} placeholder="+966XXXXXXXXX" keyboardType="phone-pad" />
        <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />
        <GInput label="العنوان" value={address} onChangeText={setAddress} placeholder="عنوان المورد" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>البيانات التجارية</Text>
        <GInput label="الرقم الضريبي" value={vatNumber} onChangeText={setVatNumber} placeholder="رقم تسجيل الضريبة" keyboardType="numeric" />
        <GInput label="السجل التجاري" value={crNumber} onChangeText={setCrNumber} placeholder="رقم السجل التجاري" />
        <GSelect label="شروط الدفع" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="ملاحظات…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 60, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton title="إضافة المورد" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
