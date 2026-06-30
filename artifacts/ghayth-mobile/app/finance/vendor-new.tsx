/**
 * مورد جديد
 * POST /api/finance/vendors
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const PAYMENTTERMS_OPTIONS = [
  { label: 'نقدي', value: 'cash' },
  { label: '30 يوم', value: 'net30' },
  { label: '60 يوم', value: 'net60' },
  { label: '90 يوم', value: 'net90' },
];

export default function موردجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('cash');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/vendors', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم المورد مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        crNumber: crNumber || undefined,
        vatNumber: vatNumber || undefined,
        paymentTerms: paymentTerms || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مورد جديد' }} />
      <GCard style={styles.card}>
        <GInput label="اسم المورد *" value={name} onChangeText={setName} placeholder="اسم المورد" error={errors["name"]} />
        <GInput label="رقم الجوال" value={phone} onChangeText={setPhone} placeholder="رقم الجوال" />
        <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" />
        <GInput label="رقم السجل التجاري" value={crNumber} onChangeText={setCrNumber} placeholder="رقم السجل" />
        <GInput label="رقم الضريبة" value={vatNumber} onChangeText={setVatNumber} placeholder="الرقم الضريبي" />
        <GSelect label="شروط الدفع" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENTTERMS_OPTIONS} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
