/**
 * المشاريع
 * GET /api/projects
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Project {
  id: number;
  name?: string;
  clientName?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  progress?: number;
  status?: string;
  managerName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ProjectsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Project[]>('/api/projects');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المشاريع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المشاريع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-outline" title="لا توجد مشاريع" description="" />}
        renderItem={({ item }) => {
          const pct = item.progress ?? 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/projects/project-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.clientName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.clientName}</Text> : null}
                {item.managerName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.managerName}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>{pct}%</Text>
                <View style={{ flex: 1, height: 4, backgroundColor: c.border, borderRadius: 2 }}>
                  <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: c.brand, borderRadius: 2 }} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
