/**
 * مجموعات العمرة
 * GET /api/umrah/groups
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahGroup {
  id: number;
  groupName?: string;
  season?: string;
  departureDate?: string;
  returnDate?: string;
  pilgrimCount?: number;
  capacity?: number;
  status?: string;
  agentName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahGroupsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<UmrahGroup[]>('/api/umrah/groups');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المجموعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مجموعات العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-circle-outline" title="لا توجد مجموعات" description="" />}
        renderItem={({ item }) => {
          const fillPct = item.capacity ? Math.round(((item.pilgrimCount ?? 0) / item.capacity) * 100) : 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/umrah/group-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.groupName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.season ? <Text style={{ fontSize: 12, color: c.brand }}>{item.season}</Text> : null}
                {item.agentName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.agentName}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: c.textFaint }}>{fmtDate(item.departureDate)} — {fmtDate(item.returnDate)}</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.pilgrimCount ?? 0}/{item.capacity ?? 0} حاج</Text>
                <View style={{ flex: 1, height: 4, backgroundColor: c.border, borderRadius: 2 }}>
                  <View style={{ height: 4, width: `${fillPct}%` as never, backgroundColor: c.brand, borderRadius: 2 }} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
