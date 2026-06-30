import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ZatcaSettings { vatNumber?: string; mode?: string; environment?: string; enabled?: boolean; }

export default function ZatcaSettings() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ZatcaSettings>('/api/finance/zatca/settings');
  const d = (data && !Array.isArray(data)) ? data as ZatcaSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات ZATCA' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'رقم ضريبة القيمة المضافة', value: d?.vatNumber }, { label: 'الوضع', value: d?.mode }, { label: 'البيئة', value: d?.environment }, { label: 'الحالة', value: d?.enabled !== undefined ? (d.enabled ? 'مُفعَّل' : 'مُعطَّل') : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
