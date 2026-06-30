/**
 * مجموعة عمرة جديدة
 * POST /api/umrah/groups
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';


export default function مجموعةعمرةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/groups', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم المجموعة مطلوب';
    if (!packageName) e['packageName'] = 'الباقة مطلوب';
    if (!departureDate) e['departureDate'] = 'تاريخ السفر مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        packageName: packageName || undefined,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
        capacity: capacity || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مجموعة عمرة جديدة' }} />
      <GCard style={styles.card}>
        <GInput label="اسم المجموعة *" value={name} onChangeText={setName} placeholder="اسم المجموعة" error={errors["name"]} />
        <GInput label="الباقة *" value={packageName} onChangeText={setPackageName} placeholder="اسم الباقة" error={errors["packageName"]} />
        <DateInput label="تاريخ السفر *" value={departureDate} onChange={setDepartureDate} error={errors["departureDate"]} />
        <DateInput label="تاريخ العودة" value={returnDate} onChange={setReturnDate} error={errors["returnDate"]} />
        <GInput label="عدد المشتركين" value={capacity} onChangeText={setCapacity} placeholder="العدد" />
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
