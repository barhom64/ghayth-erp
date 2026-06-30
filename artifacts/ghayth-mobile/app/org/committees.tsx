import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Committee {
  id?: number;
  name?: string;
  purpose?: string;
  chairName?: string;
  memberCount?: number;
}

export default function OrgCommitteesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Committee[]>('/api/org/committees');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل اللجان…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'اللجان' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-circle-outline" title="لا توجد لجان" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
            {item.purpose ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.purpose}</Text> : null}
            {item.chairName ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 4 }}>الرئيس: {item.chairName}</Text> : null}
            {item.memberCount != null ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.memberCount} عضو</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
