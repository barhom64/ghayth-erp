import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CaseSession {
  id?: number;
  sessionDate?: string;
  court?: string;
  status?: string;
  outcome?: string;
  nextSessionDate?: string;
}

export default function CaseSessionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CaseSession[]>('/api/legal/cases/0/sessions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جلسات القضية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جلسات القضية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد جلسات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.sessionDate ? new Date(item.sessionDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.court ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.court}</Text>
            ) : null}
            {item.outcome ? (
              <Text style={{ fontSize: 12, color: c.text, marginTop: 4, textAlign: 'right' }}>{item.outcome}</Text>
            ) : null}
            {item.nextSessionDate ? (
              <Text style={{ fontSize: 11, color: c.brand, marginTop: 4, textAlign: 'right' }}>
                الجلسة القادمة: {new Date(item.nextSessionDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
