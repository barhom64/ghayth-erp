import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OperationGap {
  section?: string;
  entityId?: number;
  ref?: string;
  issue?: string;
}

export default function OperationGapsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OperationGap[]>('/api/finance/reports/operation-gaps');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فجوات العمليات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فجوات العمليات المالية' }} />
      <FlatList
        data={list}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فجوات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              {item.section ? (
                <View style={{ backgroundColor: '#F59E0B20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: '#F59E0B' }}>{item.section}</Text>
                </View>
              ) : null}
              {item.ref ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.ref}</Text> : null}
            </View>
            {item.issue ? (
              <Text style={{ fontSize: 13, color: c.text, marginTop: 6, textAlign: 'right' }}>{item.issue}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
