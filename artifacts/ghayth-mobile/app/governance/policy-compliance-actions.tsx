import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PolicyComplianceAction {
  id?: number;
  title?: string;
  dueDate?: string;
  status?: string;
  assigneeName?: string;
  priority?: string;
}

export default function PolicyComplianceActionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PolicyComplianceAction[]>('/api/governance/policies/0/compliance-actions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إجراءات الامتثال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إجراءات امتثال السياسة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد إجراءات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.title ?? '—'}</Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.assigneeName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.assigneeName}</Text> : null}
              {item.dueDate ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  {new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
