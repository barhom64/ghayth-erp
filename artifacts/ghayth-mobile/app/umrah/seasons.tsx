/**
 * مواسم العمرة
 * GET /api/umrah/seasons
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahSeason {
  id: number;
  name?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  pilgrimCount?: number;
  groupCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahSeasonsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahSeason[]>('/api/umrah/seasons');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المواسم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مواسم العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد مواسم" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.startDate ? <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(item.startDate)}</Text> : null}
              {item.endDate ? <Text style={{ fontSize: 12, color: c.textMuted }}>← {fmtDate(item.endDate)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.pilgrimCount != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.pilgrimCount} حاج</Text> : null}
              {item.groupCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.groupCount} مجموعة</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
