import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SelfSubmission {
  id?: number;
  employeeName?: string;
  type?: string;
  status?: string;
  submittedAt?: string;
  notes?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SelfSubmissionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SelfSubmission[]>('/api/employees/self-submissions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات الذاتية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الطلبات الذاتية للموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-outline" title="لا توجد طلبات ذاتية" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.type ? <Text style={{ fontSize: 11, color: c.brand }}>{item.type}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.submittedAt)}</Text>
            </View>
            {item.notes ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{item.notes}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
