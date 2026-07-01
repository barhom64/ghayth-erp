import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SmtpSettings { host?: string; port?: number; secure?: boolean; user?: string; fromEmail?: string; fromName?: string; isActive?: boolean; }

export default function SmtpSettings() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SmtpSettings>('/api/admin/vendor-settings/company/smtp');
  const d = (data && !Array.isArray(data)) ? data as SmtpSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number | boolean) => (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{value === true ? 'نعم' : value === false ? 'لا' : String(value ?? '—')}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إعدادات SMTP' }} />
      {row('المضيف', d.host)}
      {row('المنفذ', d.port)}
      {row('مشفّر', d.secure)}
      {row('المستخدم', d.user)}
      {row('بريد الإرسال', d.fromEmail)}
      {row('اسم المرسل', d.fromName)}
      {row('نشط', d.isActive)}
    </ScrollView>
  );
}
