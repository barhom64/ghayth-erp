import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PolicyAudit {
  id?: number | string;
  policyName?: string;
  domain?: string;
  status?: string;
  lastChecked?: string;
  violations?: number;
  compliant?: boolean;
}

export default function PolicyAuditScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PolicyAudit[]>('/api/admin/governance/policy-audit');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مراجعة السياسات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مراجعة السياسات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد سياسات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.policyName ?? '—'}</Text>
              <GStatusBadge status={item.compliant ? 'active' : 'suspended'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.brand }}>{item.domain}</Text> : null}
              {(item.violations ?? 0) > 0 ? (
                <Text style={{ fontSize: 11, color: '#EF4444' }}>مخالفات: {item.violations}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
