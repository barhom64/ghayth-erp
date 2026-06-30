import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommValidationItem {
  id?: number;
  channel?: string;
  status?: string;
  issue?: string;
  checkedAt?: string;
}

export default function AdminCommValidationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CommValidationItem[]>('/api/admin/communication-control/validation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل نتائج التحقق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحقق قنوات الاتصال' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="كل القنوات سليمة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.channel ?? '—'}</Text>
              {item.issue ? <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>{item.issue}</Text> : null}
            </View>
            {item.status ? (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.status === 'ok' ? '#22C55E' : '#EF4444' }} />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
