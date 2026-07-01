import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CareerProfile { id?: number; name?: string; email?: string; phone?: string; headline?: string; skills?: string[]; experience?: number; }

export default function CareersMe() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CareerProfile>('/api/careers/me');
  const d = (data && !Array.isArray(data)) ? data as CareerProfile : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{value}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'ملفي المهني' }} />
      {row('الاسم', d.name)}
      {row('البريد', d.email)}
      {row('الهاتف', d.phone)}
      {row('المسمى', d.headline)}
      {row('سنوات الخبرة', d.experience)}
      {Array.isArray(d.skills) && d.skills.length > 0 && (
        <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 6 }}>المهارات</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{d.skills.join('، ')}</Text>
        </View>
      )}
    </ScrollView>
  );
}
