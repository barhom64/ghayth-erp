import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DormantEntity { id?: number; entityType?: string; entityId?: number; name?: string; lastActivity?: string; }

export default function DormantEntitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DormantEntity[]>('/api/finance/dormant-entities');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الكيانات الخاملة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد كيانات خاملة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? `${item.entityType} #${item.entityId}`}</Text>
            {!!item.entityType && !item.name && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.entityType}</Text>}
            {!!item.lastActivity && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>آخر نشاط: {new Date(item.lastActivity).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
