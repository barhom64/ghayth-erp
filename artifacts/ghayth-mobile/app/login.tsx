/**
 * شاشة الدخول
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GInput, GButton, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const c = useColors();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim()) { setError('يرجى إدخال البريد الإلكتروني'); return; }
    if (!password) { setError('يرجى إدخال كلمة المرور'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تسجيل الدخول. يرجى التحقق من بياناتك.');
    } finally {
      setLoading(false);
    }
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

        {/* النموذج */}
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

          <GButton
            title="دخول"
            onPress={handleLogin}
            loading={loading}
            size="lg"
            style={{ marginTop: 8 }}
          />
        </View>

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
