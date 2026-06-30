import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DormantEntity {
  entityType?: string;
  entityId?: number;
  name?: string;
  lastActivity?: string;
  balance?: number;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function DormantEntitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DormantEntity[]>('/api/dormant-entities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الكيانات الخاملة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الكيانات الخاملة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.entityType}-${item.entityId ?? i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="moon-outline" title="لا توجد كيانات خاملة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.name ?? `#${item.entityId}`}</Text>
              {item.balance != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{item.balance.toLocaleString('ar-SA')}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.entityType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.entityType}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>آخر نشاط: {fmtDate(item.lastActivity)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
