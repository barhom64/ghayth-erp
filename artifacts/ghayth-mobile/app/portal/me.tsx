import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalMe { name?: string; email?: string; phone?: string; }

export default function PortalMe() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalMe>('/api/portal/me');
  const me = (data && !Array.isArray(data)) ? data as PortalMe : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !me) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملفي الشخصي' }} />
      {[{ label: 'الاسم', value: me.name }, { label: 'البريد', value: me.email }, { label: 'الهاتف', value: me.phone }].map(r => (
        <View key={r.label} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{r.label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{r.value ?? '—'}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
