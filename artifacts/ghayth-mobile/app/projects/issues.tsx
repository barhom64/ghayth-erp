/**
 * مشاكل المشاريع
 * GET /api/projects/issues
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectIssue {
  id: number;
  title?: string;
  projectName?: string;
  type?: string;
  priority?: string;
  severity?: string;
  assignedTo?: string;
  reportedAt?: string;
  dueDate?: string;
  status?: string;
  isBlocking?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#EF4444', medium: '#F59E0B', low: '#22C55E',
};

export default function ProjectIssuesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<ProjectIssue[]>('/api/projects/issues');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المشاكل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مشاكل المشاريع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bug-outline" title="لا توجد مشاكل مفتوحة" description="" />}
        renderItem={({ item }) => {
          const pColor = PRIORITY_COLOR[item.priority ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/projects/issue-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                  {item.isBlocking ? (
                    <View style={{ backgroundColor: '#EF444420', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: '#EF4444' }}>عائق</Text>
                    </View>
                  ) : null}
                </View>
                {item.projectName ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.projectName}</Text> : null}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                  {item.type ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.type}</Text> : null}
                  {item.assignedTo ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.assignedTo}</Text> : null}
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
