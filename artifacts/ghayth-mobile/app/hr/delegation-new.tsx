/**
 * تفويض صلاحيات جديد
 * POST /api/hr/delegations
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function تفويضصلاحياتجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [delegateName, setDelegateName] = useState('');
  const [scope, setScope] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/delegations', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!delegateName) e['delegateName'] = 'المفوَّض مطلوب';
    if (!scope) e['scope'] = 'الصلاحيات المفوَّضة مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    if (!endDate) e['endDate'] = 'تاريخ الانتهاء مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        delegateName: delegateName || undefined,
        scope: scope || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تفويض صلاحيات جديد' }} />

      <GCard style={styles.card}>
        <GInput label="المفوَّض *" value={delegateName} onChangeText={setDelegateName} placeholder="اسم الشخص المفوَّض" error={errors["delegateName"]} />
        <GInput label="الصلاحيات المفوَّضة *" value={scope} onChangeText={setScope} placeholder="وصف الصلاحيات" error={errors["scope"]} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
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
