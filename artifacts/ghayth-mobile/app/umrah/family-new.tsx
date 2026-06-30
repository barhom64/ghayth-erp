/**
 * عائلة عمرة جديدة
 * POST /api/umrah/families
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

export default function UmrahFamilyNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { groupId: groupIdParam } = useLocalSearchParams<{ groupId?: string }>();

  const [familyName, setFamilyName] = useState('');
  const [headName, setHeadName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupId, setGroupId] = useState(groupIdParam ?? '');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/families', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!familyName) e['familyName'] = 'اسم العائلة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        familyName: familyName || undefined,
        headName: headName || undefined,
        phone: phone || undefined,
        groupId: groupId ? Number(groupId) : undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عائلة عمرة جديدة' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="اسم العائلة *" value={familyName} onChangeText={setFamilyName} placeholder="اسم العائلة" error={errors["familyName"]} />
        <GInput label="رب العائلة" value={headName} onChangeText={setHeadName} placeholder="اسم رب العائلة" />
        <GInput label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="رقم الهاتف" />
        <GInput label="رقم المجموعة" value={groupId} onChangeText={setGroupId} placeholder="رقم المجموعة" />
        <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="ملاحظات" />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
