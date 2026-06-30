import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GroupPortfolioItem {
  id?: number;
  groupName?: string;
  groupNumber?: string;
  pilgrims?: number;
  revenue?: number;
  cost?: number;
  profit?: number;
  status?: string;
}

export default function GroupPortfolioScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GroupPortfolioItem[]>('/api/umrah/reports/group-portfolio');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل محفظة المجموعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'محفظة المجموعات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-circle-outline" title="لا توجد مجموعات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.groupName ?? item.groupNumber ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.pilgrims != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.pilgrims} حاج</Text> : null}
              {item.profit != null ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: item.profit >= 0 ? '#22C55E' : '#EF4444' }}>
                  {item.profit.toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
