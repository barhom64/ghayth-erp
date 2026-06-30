import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnlinkedAgent {
  id?: number;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
}

export default function UnlinkedAgentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnlinkedAgent[]>('/api/umrah/sub-agents/unlinked');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل وكلاء غير مرتبطين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وكلاء غير مرتبطين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-outline" title="لا يوجد وكلاء غير مرتبطين" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#F59E0B', padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>{item.name ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.phone ? <Text style={{ fontSize: 11, color: c.brand }}>{item.phone}</Text> : null}
              {item.city ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.city}</Text> : null}
              {item.country ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.country}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
