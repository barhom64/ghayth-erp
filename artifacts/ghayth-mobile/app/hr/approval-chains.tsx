/**
 * سلاسل الاعتماد
 * GET /api/hr/approval-chains
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalChain {
  id: number;
  name?: string;
  processType?: string;
  stepCount?: number;
  isActive?: boolean;
  department?: string;
}

export default function ApprovalChainsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApprovalChain[]>('/api/hr/approval-chains');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سلاسل الاعتماد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلاسل الاعتماد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد سلاسل اعتماد" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.processType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.processType}</Text> : null}
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
              {item.stepCount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.stepCount} خطوات</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
