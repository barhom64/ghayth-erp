import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RequestWorkflow {
  id?: number;
  name?: string;
  requestType?: string;
  stepsCount?: number;
  isActive?: boolean;
  status?: string;
}

export default function RequestWorkflowsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RequestWorkflow[]>('/api/requests/workflows');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تدفقات الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تدفقات الطلبات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد تدفقات طلبات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, opacity: item.isActive === false ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.isActive !== false ? 'active' : 'inactive'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.requestType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.requestType}</Text> : null}
              {item.stepsCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.stepsCount} خطوات</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
