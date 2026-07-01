import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisplaySettings { theme?: string; language?: string; dateFormat?: string; currency?: string; }

export default function SettingsDisplayScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DisplaySettings>('/api/settings/display');
  const info = (data && !Array.isArray(data)) ? data as DisplaySettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!info) return <GEmptyState icon="settings-outline" title="لا توجد إعدادات" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات العرض' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[
          { label: 'السمة', value: info.theme },
          { label: 'اللغة', value: info.language },
          { label: 'تنسيق التاريخ', value: info.dateFormat },
          { label: 'العملة', value: info.currency },
        ].map(row => row.value ? (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
