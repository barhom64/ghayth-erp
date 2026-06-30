import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionSettings {
  enabled?: boolean;
  checkInterval?: string;
  absenceThreshold?: number;
  lateThreshold?: number;
  autoViolationType?: string;
  notifyManager?: boolean;
  [key: string]: unknown;
}

export default function HrDisciplineAutoSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AutoDetectionSettings>('/api/hr/discipline/auto-detection/settings');
  const d = (data && !Array.isArray(data)) ? data as AutoDetectionSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات الكشف التلقائي…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'الكشف التلقائي', value: d?.enabled ? 'مفعّل' : 'معطّل', color: d?.enabled ? '#22C55E' : '#EF4444' },
    { label: 'دورة الفحص', value: d?.checkInterval ?? '—', color: c.text },
    { label: 'حد الغياب (أيام)', value: String(d?.absenceThreshold ?? '—'), color: '#F59E0B' },
    { label: 'حد التأخير (دقائق)', value: String(d?.lateThreshold ?? '—'), color: '#F59E0B' },
    { label: 'نوع المخالفة التلقائية', value: d?.autoViolationType ?? '—', color: c.brand },
    { label: 'إشعار المدير', value: d?.notifyManager ? 'نعم' : 'لا', color: c.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات الكشف التلقائي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.textMuted }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: r.color }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
