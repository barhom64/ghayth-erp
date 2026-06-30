import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TaskSlaSettings {
  defaultSlaHours?: number;
  reminderBeforeHours?: number;
  escalationEnabled?: boolean;
  escalationAfterHours?: number;
  notifyAssignee?: boolean;
}

export default function SettingsTaskSlaScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TaskSlaSettings>('/api/settings/task-sla-reminder');
  const d = (data && !Array.isArray(data)) ? data as TaskSlaSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات SLA…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'مهلة SLA الافتراضية (ساعات)', value: d?.defaultSlaHours != null ? `${d.defaultSlaHours} ساعة` : '—' },
    { label: 'تذكير قبل (ساعات)', value: d?.reminderBeforeHours != null ? `${d.reminderBeforeHours} ساعة` : '—' },
    { label: 'التصعيد التلقائي', value: d?.escalationEnabled ? 'مفعّل' : 'معطّل' },
    { label: 'التصعيد بعد (ساعات)', value: d?.escalationAfterHours != null ? `${d.escalationAfterHours} ساعة` : '—' },
    { label: 'إشعار المكلَّف', value: d?.notifyAssignee ? 'نعم' : 'لا' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات SLA المهام' }} />
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
