import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UpcomingSession {
  id?: number;
  caseNumber?: string;
  caseName?: string;
  court?: string;
  sessionDate?: string;
  status?: string;
  daysLeft?: number;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UpcomingSessionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UpcomingSession[]>('/api/legal/sessions/upcoming');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الجلسات القادمة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الجلسات القادمة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد جلسات قادمة" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 7;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: urgent ? '#EF4444' : c.brand, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.caseName ?? item.caseNumber ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.court ? <Text style={{ fontSize: 11, color: c.brand }}>{item.court}</Text> : null}
                <Text style={{ fontSize: 11, color: urgent ? '#EF4444' : c.textFaint }}>{fmtDate(item.sessionDate)}</Text>
                {item.daysLeft != null ? <Text style={{ fontSize: 11, fontWeight: '700', color: urgent ? '#EF4444' : c.textMuted }}>{item.daysLeft} يوم</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
