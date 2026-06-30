import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JitRequest {
  id?: number;
  employeeName?: string;
  requestedRole?: string;
  reason?: string;
  requestedAt?: string;
  expiresAt?: string;
  status?: string;
}

export default function JitPendingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JitRequest[]>('/api/rbac/v2/jit/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات الوصول المؤقت…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الوصول المؤقت' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد طلبات معلقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.requestedRole ? <Text style={{ fontSize: 12, color: c.brand }}>{item.requestedRole}</Text> : null}
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.reason}</Text> : null}
            {item.expiresAt ? (
              <Text style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>
                ينتهي: {new Date(item.expiresAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
