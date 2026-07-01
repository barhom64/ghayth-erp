import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HolidayCheckItem { date?: string; name?: string; isHoliday?: boolean; }

export default function PublicHolidaysCheck() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<HolidayCheckItem[]>('/api/hr/public-holidays/check');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فحص الإجازات الرسمية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.date ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? item.date ?? ''}</Text>
            <Text style={{ color: item.isHoliday ? c.brand : c.textMuted, fontSize: 12 }}>{item.isHoliday ? 'إجازة' : 'يوم عمل'}</Text>
          </View>
        )}
      />
    </View>
  );
}
