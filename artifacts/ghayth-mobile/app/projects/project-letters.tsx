import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectLetter {
  id?: number;
  subject?: string;
  recipient?: string;
  letterDate?: string;
  status?: string;
  type?: string;
}

export default function ProjectLettersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectLetter[]>('/api/projects/0/letters');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطابات المشروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطابات المشروع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد خطابات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.subject ?? '—'}</Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.recipient ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {item.letterDate ? new Date(item.letterDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
