import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ReprintRequest {
  id?: number;
  status?: string;
  entityType?: string;
  entityId?: string;
  requesterName?: string;
  reason?: string;
  requestedAt?: string;
}

export default function ReprintRequestsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ReprintRequest[]>('/api/print/reprint-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات إعادة الطباعة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusColor = (s?: string) => s === 'approved' ? '#22C55E' : s === 'pending' ? '#F59E0B' : s === 'rejected' ? '#EF4444' : '#9CA3AF';
  const statusLabel = (s?: string) => s === 'approved' ? 'معتمد' : s === 'pending' ? 'قيد المراجعة' : s === 'rejected' ? 'مرفوض' : s ?? '—';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات إعادة الطباعة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="refresh-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.entityType ?? '—'} #{item.entityId ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{statusLabel(item.status)}</Text>
            </View>
            {item.requesterName ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.requesterName}</Text>
            ) : null}
            {item.reason ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }} numberOfLines={2}>{item.reason}</Text>
            ) : null}
            {item.requestedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.requestedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
