import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalOverride {
  id?: number;
  entityType?: string;
  entityId?: number;
  overriddenBy?: string;
  reason?: string;
  status?: string;
  createdAt?: string;
}

export default function AdminApprovalOverridesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApprovalOverride[]>('/api/approval-actions/overrides/report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير التجاوزات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تجاوزات الاعتماد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد تجاوزات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.entityType ?? '—'} #{item.entityId ?? ''}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.overriddenBy ? <Text style={{ fontSize: 12, color: c.brand }}>{item.overriddenBy}</Text> : null}
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }} numberOfLines={2}>{item.reason}</Text> : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
