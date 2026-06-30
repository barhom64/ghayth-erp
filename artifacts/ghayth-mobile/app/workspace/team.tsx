import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TeamMember {
  id?: number;
  name?: string;
  jobTitle?: string;
  status?: string;
  department?: string;
}

export default function WorkspaceTeamScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TeamMember[]>('/api/workspace/team');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفريق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فريقي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد أعضاء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.brand }}>{(item.name ?? '?')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.jobTitle ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>{item.jobTitle}</Text> : null}
              {item.department ? <Text style={{ fontSize: 11, color: c.brand, marginTop: 1 }}>{item.department}</Text> : null}
            </View>
            {item.status ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status === 'active' ? '#22C55E' : '#9CA3AF' }} />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
