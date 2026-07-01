import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VapidKey { publicKey?: string; }

export default function PushVapidKey() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VapidKey>('/api/communications/push/vapid-key');
  const item = (data && !Array.isArray(data)) ? data as VapidKey : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مفتاح Push VAPID' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المفتاح العام</Text>
          <Text style={{ color: c.text, fontSize: 12, marginTop: 8, fontFamily: 'monospace' }} selectable>{item?.publicKey ?? '—'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
