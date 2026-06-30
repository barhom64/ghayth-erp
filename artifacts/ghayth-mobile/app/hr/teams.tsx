/**
 * الفرق
 * GET /api/org/teams
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OrgTeam {
  id: number;
  name?: string;
  teamType?: string;
  leaderName?: string;
  memberCount?: number;
  department?: string;
}

export default function TeamsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OrgTeam[]>('/api/org/teams');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفرق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفرق' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-circle-outline" title="لا توجد فرق" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.memberCount != null ? <Text style={{ fontSize: 12, color: c.brand, fontWeight: '700' }}>{item.memberCount} عضو</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.teamType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.teamType}</Text> : null}
              {item.leaderName ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.leaderName}</Text> : null}
              {item.department ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.department}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
