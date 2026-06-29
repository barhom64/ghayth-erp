/**
 * شاشة الدخول — تدعم المصادقة الثنائية (2FA)
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GInput, GButton, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const c = useColors();
  const { login, loginWith2fa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // حالة 2FA
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');

  const handleLogin = async () => {
    if (!email.trim()) { setError('يرجى إدخال البريد الإلكتروني'); return; }
    if (!password) { setError('يرجى إدخال كلمة المرور'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (result?.twoFactorRequired) {
        setPendingToken(result.pendingToken);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تسجيل الدخول. يرجى التحقق من بياناتك.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async () => {
    if (!otpCode.trim()) { setError('يرجى إدخال رمز التحقق'); return; }
    if (!pendingToken) return;
    setError('');
    setLoading(true);
    try {
      await loginWith2fa(pendingToken, otpCode.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setPendingToken(null);
    setOtpCode('');
    setError('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* الشعار */}
        <View style={styles.logoBox}>
          <View style={[styles.logoCircle, { backgroundColor: c.brand }]}>
            <Ionicons name="leaf" size={40} color="#FFF" />
          </View>
          <GText variant="display" style={{ marginTop: 16 }}>غيث</GText>
          <GText variant="body" color={c.textMuted} style={{ marginTop: 4 }}>نظام إدارة المؤسسات</GText>
        </View>

        {pendingToken ? (
          /* نموذج التحقق الثنائي */
          <View style={[styles.formBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Ionicons name="shield-checkmark-outline" size={26} color={c.brand} />
              </View>
              <GText variant="subheading" style={{ marginBottom: 6 }}>التحقق بخطوتين</GText>
              <GText variant="caption" color={c.textMuted} align="center">أدخل الرمز من تطبيق المصادقة</GText>
            </View>

            <GInput
              label="رمز التحقق"
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="000000"
              keyboardType="number-pad"
              autoCapitalize="none"
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1, textAlign: 'right', marginRight: 6 }}>{error}</Text>
              </View>
            ) : null}

            <GButton title="تحقق" onPress={handleVerify2fa} loading={loading} size="lg" style={{ marginTop: 8 }} />
            <GButton title="رجوع" variant="secondary" onPress={handleBack} style={{ marginTop: 8 }} />
          </View>
        ) : (
          /* نموذج الدخول */
          <View style={[styles.formBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <GText variant="subheading" style={{ marginBottom: 20 }}>تسجيل الدخول</GText>

            <GInput
              label="البريد الإلكتروني"
              value={email}
              onChangeText={setEmail}
              placeholder="أدخل بريدك الإلكتروني"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <GInput
              label="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              placeholder="أدخل كلمة المرور"
              secureTextEntry
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1, textAlign: 'right', marginRight: 6 }}>{error}</Text>
              </View>
            ) : null}

            <GButton title="دخول" onPress={handleLogin} loading={loading} size="lg" style={{ marginTop: 8 }} />
          </View>
        )}

        <GText variant="caption" color={c.textFaint} align="center" style={{ marginTop: 24 }}>
          نظام غيث ERP — مجموعة الدور الحديثة
        </GText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  formBox: { borderWidth: 1, borderRadius: 16, padding: 24 },
  errorBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 },
});
