import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ComplianceAction {
  id?: number;
  title?: string;
  owner?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  daysLeft?: number;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ComplianceActionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ComplianceAction[]>('/api/governance/compliance-actions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إجراءات الامتثال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إجراءات الامتثال' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد إجراءات امتثال' مفتوحة" description="" />}
        renderItem={({ item }) => {
          const overdue = (item.daysLeft ?? 1) < 0;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: overdue ? '#EF4444' : item.priority === 'high' ? '#F59E0B' : c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.owner ? <Text style={{ fontSize: 11, color: c.brand }}>{item.owner}</Text> : null}
                {item.priority ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.priority}</Text> : null}
                <Text style={{ fontSize: 11, color: overdue ? '#EF4444' : c.textFaint }}>{fmtDate(item.dueDate)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
