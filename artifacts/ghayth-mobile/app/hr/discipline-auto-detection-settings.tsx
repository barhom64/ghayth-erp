import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectSettings { enabled?: boolean; lateThresholdMinutes?: number; absentAfterMinutes?: number; autoCreateViolation?: boolean; }

export default function DisciplineAutoDetectionSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AutoDetectSettings>('/api/hr/discipline/auto-detection/settings');
  const d = (data && !Array.isArray(data)) ? data as AutoDetectSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['التفعيل', d.enabled ? 'مفعّل' : 'معطّل'],
    ['حد التأخر (دقائق)', String(d.lateThresholdMinutes ?? 0)],
    ['غياب بعد (دقائق)', String(d.absentAfterMinutes ?? 0)],
    ['إنشاء مخالفة تلقائية', d.autoCreateViolation ? 'نعم' : 'لا'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات الكشف التلقائي' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
