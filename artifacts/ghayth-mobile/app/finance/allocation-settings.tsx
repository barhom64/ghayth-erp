import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocationSettings { enforceLineAllocation?: boolean; [key: string]: unknown; }

export default function AllocationSettings() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AllocationSettings>('/api/finance/settings/enforce-line-allocation');
  const settings = (data && !Array.isArray(data)) ? data as AllocationSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات توزيع السطور' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {settings ? Object.entries(settings).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{String(v ?? '—')}</Text>
          </View>
        )) : <GEmptyState icon="settings-outline" title="لا توجد إعدادات" description="" />}
      </ScrollView>
    </View>
  );
}
