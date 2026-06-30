/**
 * مهام المشاريع
 * GET /api/projects/tasks
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectTask {
  id: number;
  title?: string;
  projectName?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  progress?: number;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#EF4444', medium: '#F59E0B', low: '#22C55E',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ProjectTasksScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<ProjectTask[]>('/api/projects/tasks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المهام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مهام المشاريع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد مهام" description="" />}
        renderItem={({ item }) => {
          const pColor = PRIORITY_COLOR[item.priority ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/projects/task-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  {item.projectName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.projectName}</Text> : null}
                  {item.assignedTo ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.assignedTo}</Text> : null}
                  {item.dueDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.dueDate)}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
