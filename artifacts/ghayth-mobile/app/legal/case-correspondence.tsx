import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CaseCorrespondence {
  id?: number;
  subject?: string;
  correspondenceDate?: string;
  direction?: string;
  party?: string;
  summary?: string;
}

export default function CaseCorrespondenceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CaseCorrespondence[]>('/api/legal/cases/0/correspondence');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مراسلات القضية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مراسلات القضية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد مراسلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.subject ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: item.direction === 'outgoing' ? c.brand : '#22C55E' }}>
                {item.direction === 'outgoing' ? 'صادر' : 'وارد'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.party ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {item.correspondenceDate ? new Date(item.correspondenceDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
