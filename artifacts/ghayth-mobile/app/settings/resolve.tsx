import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ResolvedSettings { [key: string]: unknown; }

export default function SettingsResolveScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ResolvedSettings>('/api/settings/resolve');
  const info = (data && !Array.isArray(data)) ? data as ResolvedSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!info) return <GEmptyState icon="options-outline" title="لا توجد إعدادات" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإعدادات المحلولة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {Object.entries(info).map(([key, val]) => (
          <View key={key} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{key}</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{String(val ?? '')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
