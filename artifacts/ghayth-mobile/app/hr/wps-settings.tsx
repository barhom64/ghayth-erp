import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsSettings {
  bankCode?: string;
  companyId?: string;
  fileFormat?: string;
  autoSubmit?: boolean;
  submissionDay?: number;
  [key: string]: unknown;
}

export default function HrWpsSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<WpsSettings>('/api/wps/settings');
  const d = (data && !Array.isArray(data)) ? data as WpsSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات WPS…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'كود البنك', value: d?.bankCode ?? '—' },
    { label: 'معرّف الشركة', value: d?.companyId ?? '—' },
    { label: 'صيغة الملف', value: d?.fileFormat ?? '—' },
    { label: 'إرسال تلقائي', value: d?.autoSubmit ? 'نعم' : 'لا' },
    { label: 'يوم الإرسال', value: d?.submissionDay != null ? String(d.submissionDay) : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات WPS' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.textMuted }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
