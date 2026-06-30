import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InfraAlertSettings { notifyOnCritical?: boolean; notifyOnWarning?: boolean; channels?: string[]; thresholds?: Record<string, number>; }

export default function InfraAlertSettings() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InfraAlertSettings>('/api/intelligence/alerts/infra/settings');
  const d = (data && !Array.isArray(data)) ? data as InfraAlertSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إعدادات تنبيهات البنية التحتية' }} />
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>تنبيه عند الحرجي</Text>
        <Text style={{ color: c.text, fontSize: 13 }}>{d.notifyOnCritical ? 'نعم' : 'لا'}</Text>
      </View>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>تنبيه عند التحذير</Text>
        <Text style={{ color: c.text, fontSize: 13 }}>{d.notifyOnWarning ? 'نعم' : 'لا'}</Text>
      </View>
      {Array.isArray(d.channels) && d.channels.length > 0 && (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>قنوات الإشعار</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{d.channels.join('، ')}</Text>
        </View>
      )}
    </ScrollView>
  );
}
