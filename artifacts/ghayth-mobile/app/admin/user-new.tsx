/**
 * مستخدم جديد
 * POST /api/admin/users
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

export default function UserNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/admin/users', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email) e['email'] = 'البريد الإلكتروني مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        email: email || undefined,
        role: role || undefined,
        password: password || undefined,
      } as never);
      Alert.alert('تم', 'تم إنشاء المستخدم بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مستخدم جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="البريد الإلكتروني *" value={email} onChangeText={setEmail} placeholder="example@domain.com" error={errors["email"]} />
        <GInput label="الدور" value={role} onChangeText={setRole} placeholder="مثال: employee" />
        <GInput label="كلمة المرور" value={password} onChangeText={setPassword} placeholder="8 أحرف على الأقل (اختياري)" />
      </GCard>
      <GButton title="إنشاء المستخدم" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
