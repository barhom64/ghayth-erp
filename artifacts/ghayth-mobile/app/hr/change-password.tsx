/**
 * تغيير كلمة المرور — POST /api/auth/change-password
 * عند النجاح: تُستبطَل جلسات الموظف، يُسجَّل الخروج تلقائيًا.
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GButton, GInput } from '@workspace/ui-native';
import { apiFetch } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

const MIN_LEN = 8;
const STRONG_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!current) errs.current = 'أدخل كلمة المرور الحالية';
    if (!next) {
      errs.next = 'أدخل كلمة المرور الجديدة';
    } else if (next.length < MIN_LEN) {
      errs.next = 'كلمة المرور 8 أحرف على الأقل';
    } else if (!STRONG_RE.test(next)) {
      errs.next = 'يجب أن تحتوي على حرف كبير وصغير ورقم';
    }
    if (!confirm) {
      errs.confirm = 'أعد إدخال كلمة المرور الجديدة';
    } else if (next && confirm !== next) {
      errs.confirm = 'كلمتا المرور غير متطابقتين';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      Alert.alert(
        'تم',
        'تم تغيير كلمة المرور بنجاح. ستحتاج إلى تسجيل الدخول مجدداً.',
        [{ text: 'حسنًا', onPress: () => logout() }],
      );
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'تغيير كلمة المرور' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <GCard>
          <GInput
            label="كلمة المرور الحالية *"
            value={current}
            onChangeText={setCurrent}
            placeholder="أدخل كلمة مرورك الحالية"
            secureTextEntry
            error={errors.current}
          />
          <GInput
            label="كلمة المرور الجديدة *"
            value={next}
            onChangeText={setNext}
            placeholder="8 أحرف على الأقل"
            secureTextEntry
            error={errors.next}
          />
          <GInput
            label="تأكيد كلمة المرور الجديدة *"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="أعد كتابة كلمة المرور الجديدة"
            secureTextEntry
            error={errors.confirm}
          />
          <GButton
            title="تغيير كلمة المرور"
            icon="lock-closed-outline"
            onPress={onSubmit}
            loading={loading}
            style={{ marginTop: 8 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
