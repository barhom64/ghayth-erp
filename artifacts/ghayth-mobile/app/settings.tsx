/**
 * الإعدادات — تفضيلات المستخدم والتطبيق
 * GET /api/me (profile)
 * PATCH /api/me/settings (preferences)
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen() {
  const c = useColors();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [saving, setSaving] = useState(false);

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج من الحساب؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: logout },
    ]);
  };

  const LINKS: Array<{ label: string; icon: IoniconName; route: string; desc?: string }> = [
    { label: 'تغيير كلمة المرور', icon: 'lock-closed-outline', route: '/hr/change-password' },
    { label: 'أرصدة الإجازات', icon: 'calendar-outline', route: '/hr/leave-balances' },
    { label: 'سجل حضوري', icon: 'time-outline', route: '/hr/my-attendance' },
    { label: 'وثائقي', icon: 'document-text-outline', route: '/hr/my-documents' },
    { label: 'تقييماتي', icon: 'star-outline', route: '/hr/my-performance' },
    { label: 'كشف الراتب', icon: 'cash-outline', route: '/hr/payslip' },
  ];

  const ABOUT = [
    { label: 'الإصدار', value: '1.0.0' },
    { label: 'البيئة', value: 'الإنتاج' },
    { label: 'الشركة', value: user?.companyName ?? '—' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإعدادات' }} />

      {/* معلومات المستخدم */}
      <View style={[styles.profileBox, { backgroundColor: c.primary }]}>
        <View style={[styles.avatar, { backgroundColor: c.onPrimary + '30' }]}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: c.onPrimary }}>
            {(user?.name ?? '؟')[0]}
          </Text>
        </View>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.onPrimary, textAlign: 'right' }}>{user?.name ?? '—'}</Text>
          {user?.email ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{user.email}</Text> : null}
          {user?.jobTitle ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{user.jobTitle}</Text> : null}
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>

        {/* روابط سريعة */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>ملفي الشخصي</GText>
        <GCard style={{ gap: 0, padding: 0 }}>
          {LINKS.map((link, i) => (
            <Pressable
              key={link.label}
              onPress={() => router.push(link.route as never)}
              style={({ pressed }) => [
                styles.linkRow,
                { borderBottomColor: c.border },
                i < LINKS.length - 1 && { borderBottomWidth: 1 },
                pressed && { backgroundColor: c.surfaceAlt },
              ]}
            >
              <Ionicons name="chevron-back-outline" size={16} color={c.textFaint} />
              <Text style={{ flex: 1, fontSize: 14, color: c.text, textAlign: 'right' }}>{link.label}</Text>
              <Ionicons name={link.icon} size={20} color={c.brand} />
            </Pressable>
          ))}
        </GCard>

        {/* حول التطبيق */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>حول التطبيق</GText>
        <GCard style={{ gap: 0, padding: 0 }}>
          {ABOUT.map((row, i) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < ABOUT.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, fontWeight: '500' }}>{row.value}</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* تسجيل الخروج */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            { backgroundColor: pressed ? c.dangerSurface : c.surface, borderColor: c.danger + '40' },
          ]}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.danger }}>تسجيل الخروج</Text>
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileBox: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, gap: 0 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row-reverse', alignItems: 'center', padding: 14, gap: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 12, borderWidth: 1 },
});
