/**
 * تفاصيل المستخدم
 * GET /api/admin/users/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface AdminUser {
  id: number;
  ref?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  roles?: string[];
  companies?: string[];
  lastLogin?: string;
  createdAt?: string;
  employeeName?: string;
  twoFactorEnabled?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function AdminUserDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: user, isLoading } = useList<AdminUser>(`/api/admin/users/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المستخدم…" />;
  if (!user) return <GEmptyState icon="person-circle-outline" title="مستخدم غير موجود" description="تعذّر العثور على بيانات المستخدم" />;

  const st = statusBadge(user.status ?? '');
  const isActive = user.status === 'active';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: user.name ?? 'المستخدم' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: isActive ? '#1D4ED8' : '#6B7280' }]}>
        <GAvatar name={user.name ?? '?'} size="lg" />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{user.name ?? '—'}</Text>
          {user.email ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{user.email}</Text> : null}
          {user.employeeName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{user.employeeName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'البريد الإلكتروني', value: user.email },
            { label: 'الهاتف', value: user.phone },
            { label: 'آخر تسجيل دخول', value: user.lastLogin ? fmtDate(user.lastLogin) : undefined },
            { label: 'تاريخ الإنشاء', value: user.createdAt ? fmtDate(user.createdAt) : undefined },
            { label: 'التحقق الثنائي', value: user.twoFactorEnabled !== undefined ? (user.twoFactorEnabled ? 'مُفعَّل' : 'غير مُفعَّل') : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {user.roles && user.roles.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الأدوار</GText>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {user.roles.map((role, i) => (
                <View key={i} style={{ backgroundColor: c.brand + '20', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: c.brand, fontWeight: '600' }}>{role}</Text>
                </View>
              ))}
            </View>
          </GCard>
        )}

        {user.companies && user.companies.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الشركات المرتبطة</GText>
            {user.companies.map((company, i) => (
              <Text key={i} style={{ fontSize: 13, color: c.text, textAlign: 'right', paddingVertical: 4, borderBottomWidth: i < user.companies!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>{company}</Text>
            ))}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
