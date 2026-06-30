import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GlGap {
  entityType?: string;
  entityId?: number;
  entityRef?: string;
  gapType?: string;
  description?: string;
}

export default function GlIntegrityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GlGap[]>('/api/reports/gl-integrity-gaps');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فجوات الدفتر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فجوات سلامة الدفتر' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.entityType}-${item.entityId}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد فجوات في الدفتر" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#EF4444', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.entityType}</Text> : null}
              {item.entityRef ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.entityRef}</Text> : null}
            </View>
            {item.gapType ? <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'right' }}>{item.gapType}</Text> : null}
            {item.description ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }} numberOfLines={2}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
