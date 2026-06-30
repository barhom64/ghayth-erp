import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxRoutingSettings {
  defaultMailbox?: string;
  autoAssign?: boolean;
  roundRobin?: boolean;
  priorityRouting?: boolean;
  slaHours?: number;
}

export default function SettingsInboxRoutingScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<InboxRoutingSettings>('/api/settings/inbox-routing');
  const d = (data && !Array.isArray(data)) ? data as InboxRoutingSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات التوجيه…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'صندوق البريد الافتراضي', value: d?.defaultMailbox ?? '—' },
    { label: 'التعيين التلقائي', value: d?.autoAssign ? 'مفعّل' : 'معطّل' },
    { label: 'التوزيع الدوري', value: d?.roundRobin ? 'مفعّل' : 'معطّل' },
    { label: 'التوجيه بالأولوية', value: d?.priorityRouting ? 'مفعّل' : 'معطّل' },
    { label: 'مهلة SLA (ساعات)', value: d?.slaHours != null ? String(d.slaHours) : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات توجيه البريد' }} />
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
