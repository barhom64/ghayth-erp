import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SeasonItem { id?: number; season?: string; totalGroups?: number; totalPilgrims?: number; revenue?: number; }

export default function UmrahSeasonPortfolioScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SeasonItem[]>('/api/umrah/reports/season-portfolio');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'محفظة الموسم' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.season ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.totalGroups != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.totalGroups} مجموعة</Text> : null}
              {item.totalPilgrims != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.totalPilgrims} حاج</Text> : null}
              {item.revenue != null ? <Text style={{ color: c.brand, fontSize: 13 }}>{item.revenue.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
