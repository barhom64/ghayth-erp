import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SeasonPortfolioItem {
  groupId?: number;
  groupName?: string;
  pilgrims?: number;
  capacity?: number;
  revenue?: number;
  currency?: string;
  status?: string;
  season?: string;
}

export default function SeasonPortfolioScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SeasonPortfolioItem[]>('/api/reports/season-portfolio');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل محفظة الموسم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'محفظة الموسم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.groupId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد بيانات محفظة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.groupName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.pilgrims != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.pilgrims}/{item.capacity ?? '—'} حاج</Text> : null}
              {item.revenue != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.revenue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.season ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.season}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
