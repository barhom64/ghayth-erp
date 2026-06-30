import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalTicket { id?: number; subject?: string; status?: string; priority?: string; category?: string; createdAt?: string; description?: string; }

export default function PortalTicketDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalTicket>('/api/portal/tickets/0');
  const d = (data && !Array.isArray(data)) ? data as PortalTicket : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.subject ?? 'تفاصيل التذكرة' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.subject ?? '-'}</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
          <GStatusBadge status={d.status ?? 'open'} />
        </View>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.description ?? '-'}</Text>
      </View>
    </ScrollView>
  );
}
