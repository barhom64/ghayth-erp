/**
 * وكيل عمرة جديد
 * POST /api/umrah/agents
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';


export default function وكيلعمرةجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/agents', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم الوكيل مطلوب';
    if (!phone) e['phone'] = 'رقم الجوال مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        licenseNumber: licenseNumber || undefined,
        city: city || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'وكيل عمرة جديد' }} />
      <GCard style={styles.card}>
        <GInput label="اسم الوكيل *" value={name} onChangeText={setName} placeholder="اسم الوكيل" error={errors["name"]} />
        <GInput label="رقم الجوال *" value={phone} onChangeText={setPhone} placeholder="رقم الجوال" error={errors["phone"]} />
        <GInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" />
        <GInput label="رقم الترخيص" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="رقم الترخيص" />
        <GInput label="المدينة" value={city} onChangeText={setCity} placeholder="المدينة" />
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
