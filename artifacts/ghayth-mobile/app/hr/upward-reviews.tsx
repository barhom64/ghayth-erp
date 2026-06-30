import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UpwardReview {
  id?: number;
  employeeName?: string;
  managerName?: string;
  score?: number;
  status?: string;
  createdAt?: string;
  comments?: string;
}

export default function UpwardReviewsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UpwardReview[]>('/api/hr/upward-reviews/manager/0');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقييمات الصاعدة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التقييمات الصاعدة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا توجد تقييمات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.score != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{item.score}/5</Text>
              ) : null}
            </View>
            {item.managerName ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>المدير: {item.managerName}</Text>
            ) : null}
            {item.status ? (
              <View style={{ alignItems: 'flex-end', marginTop: 6 }}>
                <GStatusBadge status={item.status} />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
