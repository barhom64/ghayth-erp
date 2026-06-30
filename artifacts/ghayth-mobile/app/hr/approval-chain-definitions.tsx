import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalChainDef {
  id?: number;
  name?: string;
  entityType?: string;
  stepsCount?: number;
  isActive?: boolean;
}

export default function ApprovalChainDefinitionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApprovalChainDef[]>('/api/hr/approval-chain-definitions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تعريفات سلاسل الاعتماد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعريفات سلاسل الاعتماد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد سلاسل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.entityType}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.stepsCount != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.stepsCount} خطوات</Text> : null}
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF', marginTop: 4 }} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
