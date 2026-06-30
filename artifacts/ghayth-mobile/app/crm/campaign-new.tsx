/**
 * حملة تسويقية جديدة
 * POST /api/crm/campaigns
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const CAMPAIGNTYPE_OPTIONS = [
  { label: 'بريد إلكتروني', value: 'email' },
  { label: 'رسائل نصية', value: 'sms' },
  { label: 'وسائل التواصل', value: 'social' },
  { label: 'فعالية', value: 'event' },
];

export default function حملةتسويقيةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState('email');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/crm/campaigns', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم الحملة مطلوب';
    if (!campaignType) e['campaignType'] = 'نوع الحملة مطلوب';
    if (!startDate) e['startDate'] = 'تاريخ البداية مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        campaignType: campaignType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        budget: budget || undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حملة تسويقية جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="اسم الحملة *" value={name} onChangeText={setName} placeholder="اسم الحملة" error={errors["name"]} />
        <GSelect label="نوع الحملة *" value={campaignType} onChange={setCampaignType} options={CAMPAIGNTYPE_OPTIONS} />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors["startDate"]} />
        <DateInput label="تاريخ الانتهاء" value={endDate} onChange={setEndDate} error={errors["endDate"]} />
        <GInput label="الميزانية" value={budget} onChangeText={setBudget} placeholder="المبلغ" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={description} onChangeText={setDescription} placeholder="وصف الحملة" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
