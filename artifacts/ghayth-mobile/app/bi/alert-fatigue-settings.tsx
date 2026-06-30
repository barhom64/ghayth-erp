import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AlertFatigueSettings {
  suppressionWindowMinutes?: number;
  maxAlertsPerHour?: number;
  cooldownAfterBurstMinutes?: number;
  enabled?: boolean;
}

export default function AlertFatigueSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AlertFatigueSettings>('/api/bi/alert-fatigue/settings');
  const d = (data && !Array.isArray(data)) ? data as AlertFatigueSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات التعب التنبيهي…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const row = (label: string, value: string | number | undefined) => (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ fontSize: 14, color: c.text }}>{label}</Text>
      <Text style={{ fontSize: 14, color: c.textMuted }}>{value ?? '—'}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات التعب التنبيهي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          {row('الحالة', d?.enabled ? 'مفعّل' : 'معطّل')}
          {row('نافذة الكبت (دقيقة)', d?.suppressionWindowMinutes)}
          {row('الحد الأقصى للتنبيهات/ساعة', d?.maxAlertsPerHour)}
          {row('التبريد بعد الانفجار (دقيقة)', d?.cooldownAfterBurstMinutes)}
        </View>
      </ScrollView>
    </View>
  );
}
