import React from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnreadCount { count?: number; }

export default function NotificationUnreadCount() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnreadCount>('/api/notifications/unread-count');
  const d = (data && !Array.isArray(data)) ? data as UnreadCount : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Stack.Screen options={{ title: 'عدد غير المقروء' }} />
      <Text style={{ color: c.brand, fontSize: 64, fontWeight: '800' }}>{d.count ?? 0}</Text>
      <Text style={{ color: c.textMuted, fontSize: 16, marginTop: 8 }}>إشعار غير مقروء</Text>
    </View>
  );
}
