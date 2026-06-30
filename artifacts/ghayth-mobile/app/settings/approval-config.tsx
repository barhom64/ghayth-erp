import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalConfig {
  requireDualApproval?: boolean;
  maxApprovalLevels?: number;
  autoApproveThreshold?: number;
  escalationTimeoutHours?: number;
  notifyOnEscalation?: boolean;
}

export default function SettingsApprovalConfigScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ApprovalConfig>('/api/settings/approval-config');
  const d = (data && !Array.isArray(data)) ? data as ApprovalConfig : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات الاعتماد…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'اعتماد مزدوج مطلوب', value: d?.requireDualApproval ? 'نعم' : 'لا' },
    { label: 'أقصى مستويات اعتماد', value: d?.maxApprovalLevels != null ? String(d.maxApprovalLevels) : '—' },
    { label: 'حد الاعتماد التلقائي', value: d?.autoApproveThreshold != null ? `${d.autoApproveThreshold.toLocaleString('ar-SA')} ر.س` : '—' },
    { label: 'مهلة التصعيد (ساعات)', value: d?.escalationTimeoutHours != null ? `${d.escalationTimeoutHours} ساعة` : '—' },
    { label: 'إشعار عند التصعيد', value: d?.notifyOnEscalation ? 'مفعّل' : 'معطّل' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات الاعتماد' }} />
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
