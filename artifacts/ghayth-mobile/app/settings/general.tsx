import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GeneralSettings {
  companyName?: string;
  timezone?: string;
  language?: string;
  currency?: string;
  dateFormat?: string;
  fiscalYearStart?: string;
  [key: string]: unknown;
}

export default function GeneralSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<GeneralSettings>('/api/settings/general');
  const d = (data && !Array.isArray(data)) ? data as GeneralSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإعدادات العامة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rows = [
    { label: 'اسم الشركة', value: d?.companyName },
    { label: 'المنطقة الزمنية', value: d?.timezone },
    { label: 'اللغة', value: d?.language },
    { label: 'العملة', value: d?.currency },
    { label: 'صيغة التاريخ', value: d?.dateFormat },
    { label: 'بداية السنة المالية', value: d?.fiscalYearStart },
  ].filter(r => r.value != null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإعدادات العامة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          {rows.map((row, i) => (
            <View key={row.label}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: c.border }} /> : null}
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10 }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{String(row.value)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
