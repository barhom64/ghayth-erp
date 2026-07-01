import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsSettings { bankCode?: string | null; bankIban?: string | null; filenameTemplate?: string | null; isActive?: boolean; }

export default function WpsSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WpsSettings>('/api/hr/wps/settings');
  const settings = (data && !Array.isArray(data)) ? data as WpsSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات WPS' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {settings ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>رمز البنك</Text>
              <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{settings.bankCode ?? '—'}</Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>IBAN البنك</Text>
              <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{settings.bankIban ?? '—'}</Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>قالب اسم الملف</Text>
              <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{settings.filenameTemplate ?? '—'}</Text>
            </View>
            <View>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
              <Text style={{ color: settings.isActive ? c.brand : c.textFaint, fontSize: 14, marginTop: 4 }}>{settings.isActive ? 'نشط' : 'غير نشط'}</Text>
            </View>
          </View>
        ) : <GEmptyState icon="settings-outline" title="لا توجد إعدادات" description="" />}
      </ScrollView>
    </View>
  );
}
