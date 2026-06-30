/**
 * العطل الرسمية
 * GET /api/hr/public-holidays
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PublicHoliday {
  id: number;
  name?: string;
  date?: string;
  durationDays?: number;
  isRecurring?: boolean;
  holidayType?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PublicHolidaysScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PublicHoliday[]>('/api/hr/public-holidays');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العطل الرسمية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العطل الرسمية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="flag-outline" title="لا توجد عطل رسمية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.durationDays != null ? <Text style={{ fontSize: 13, color: c.brand, fontWeight: '700' }}>{item.durationDays} أيام</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.date ? <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(item.date)}</Text> : null}
              {item.holidayType ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.holidayType}</Text> : null}
              {item.isRecurring ? <Text style={{ fontSize: 11, color: '#22C55E' }}>سنوي</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
