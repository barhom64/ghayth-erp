import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalAccount { email?: string; isActive?: boolean; lastLogin?: string; }

export default function ClientPortalScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalAccount>('/api/clients/0/portal-account');
  const d = (data && !Array.isArray(data)) ? data as PortalAccount : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="person-outline" title="لا يوجد حساب بوابة" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حساب بوابة العميل' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>البريد الإلكتروني</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.email ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.isActive ? 'نشط' : 'غير نشط'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>آخر دخول</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.lastLogin ? new Date(d.lastLogin).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
