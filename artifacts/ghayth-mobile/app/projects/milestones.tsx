/**
 * معالم المشاريع
 * GET /api/projects/milestones
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Milestone {
  id: number;
  title?: string;
  projectName?: string;
  dueDate?: string;
  completedAt?: string;
  weight?: number;
  budgetAmount?: number;
  status?: string;
  isOverdue?: boolean;
  progressPct?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ProjectMilestonesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Milestone[]>('/api/projects/milestones');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المعالم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معالم المشاريع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="flag-outline" title="لا توجد معالم" description="" />}
        renderItem={({ item }) => {
          const pct = item.progressPct ?? 0;
          const pctColor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#3B82F6' : '#F59E0B';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/projects/milestone-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.projectName ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.projectName}</Text> : null}
              <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, marginVertical: 8 }}>
                <View style={{ height: 4, width: `${Math.min(pct, 100)}%` as never, backgroundColor: pctColor, borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: pctColor }}>{pct}%</Text>
                {item.budgetAmount != null ? (
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{item.budgetAmount.toLocaleString('ar-SA')} ر.س</Text>
                ) : null}
                <Text style={{ fontSize: 11, color: item.isOverdue ? '#EF4444' : c.textFaint }}>
                  {item.isOverdue ? '⚠ متأخر — ' : ''}{fmtDate(item.dueDate)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
