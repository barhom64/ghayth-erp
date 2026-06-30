import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalTicket {
  id?: number;
  subject?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
}

export default function PortalTicketsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalTicket[]>('/api/portal/tickets');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تذاكر الدعم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تذاكر الدعم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="headset-outline" title="لا توجد تذاكر" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.subject ?? '—'}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.createdAt ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
