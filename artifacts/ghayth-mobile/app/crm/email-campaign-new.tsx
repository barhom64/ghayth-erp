/**
 * حملة بريد إلكتروني جديدة
 * POST /api/crm/email-campaigns
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function حملةبريدإلكترونيجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [subject, setSubject] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [recipientList, setRecipientList] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/crm/email-campaigns', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!subject) e['subject'] = 'عنوان الحملة مطلوب';
    if (!scheduledDate) e['scheduledDate'] = 'تاريخ الإرسال مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        subject: subject || undefined,
        scheduledDate: scheduledDate || undefined,
        recipientList: recipientList || undefined,
        body: body || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حملة بريد إلكتروني جديدة' }} />

      <GCard style={styles.card}>
        <GInput label="عنوان الحملة *" value={subject} onChangeText={setSubject} placeholder="عنوان البريد" error={errors["subject"]} />
        <DateInput label="تاريخ الإرسال *" value={scheduledDate} onChange={setScheduledDate} error={errors["scheduledDate"]} />
        <GInput label="قائمة المستلمين" value={recipientList} onChangeText={setRecipientList} placeholder="وصف الفئة المستهدفة" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={body} onChangeText={setBody} placeholder="محتوى البريد الإلكتروني" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
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
