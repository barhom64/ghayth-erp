import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TimezoneSettings {
  timezone?: string;
  utcOffset?: string;
  locale?: string;
  dateFormat?: string;
  timeFormat?: string;
}

export default function SettingsTimezoneScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TimezoneSettings>('/api/settings/timezone');
  const d = (data && !Array.isArray(data)) ? data as TimezoneSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات التوقيت…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'المنطقة الزمنية', value: d?.timezone ?? '—' },
    { label: 'فرق UTC', value: d?.utcOffset ?? '—' },
    { label: 'اللغة المحلية', value: d?.locale ?? '—' },
    { label: 'تنسيق التاريخ', value: d?.dateFormat ?? '—' },
    { label: 'تنسيق الوقت', value: d?.timeFormat ?? '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات التوقيت' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
