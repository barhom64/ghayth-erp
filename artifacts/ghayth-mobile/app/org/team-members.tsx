import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Member { id?: number; name?: string; role?: string; department?: string; }

export default function TeamMembersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Member[]>('/api/org/teams/0/members');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أعضاء الفريق' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد أعضاء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
            {item.role && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.role}</Text>}
            {item.department && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.department}</Text>}
          </View>
        )}
      />
    </View>
  );
}
