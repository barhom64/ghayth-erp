import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionSettings { enabled?: boolean; method?: string; threshold?: number; geofenceRadius?: number; }

export default function AttendanceAutoDetectionSettings() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AutoDetectionSettings>('/api/hr/attendance/auto-detection/settings');
  const d = (data && !Array.isArray(data)) ? data as AutoDetectionSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات الاكتشاف التلقائي' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الحالة', value: d?.enabled !== undefined ? (d.enabled ? 'مُفعَّل' : 'مُعطَّل') : undefined }, { label: 'طريقة الاكتشاف', value: d?.method }, { label: 'عتبة الثقة', value: d?.threshold !== undefined ? `${d.threshold}%` : undefined }, { label: 'نطاق السياج الجغرافي', value: d?.geofenceRadius !== undefined ? `${d.geofenceRadius} متر` : undefined }].map((row, i) => row.value !== undefined ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
