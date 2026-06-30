import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PlanningSettings {
  maxDistanceKm?: number;
  defaultBufferMinutes?: number;
  allowOverlap?: boolean;
  autoAssign?: boolean;
  googleMapsKey?: string;
  [key: string]: unknown;
}

export default function TransportPlanningSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PlanningSettings>('/api/transport/planning-settings');
  const d = (data && !Array.isArray(data)) ? data as PlanningSettings : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات التخطيط…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'أقصى مسافة (كم)', value: d?.maxDistanceKm != null ? String(d.maxDistanceKm) : '—' },
    { label: 'وقت الهامش (دقيقة)', value: d?.defaultBufferMinutes != null ? String(d.defaultBufferMinutes) : '—' },
    { label: 'السماح بالتداخل', value: d?.allowOverlap ? 'نعم' : 'لا' },
    { label: 'التعيين التلقائي', value: d?.autoAssign ? 'نعم' : 'لا' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات تخطيط النقل' }} />
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
