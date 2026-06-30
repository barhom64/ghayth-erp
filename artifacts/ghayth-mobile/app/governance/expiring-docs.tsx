import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpiringDoc {
  id: number;
  employeeName?: string;
  nationality?: string;
  iqamaNumber?: string;
  expiryDate?: string;
  daysLeft?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ExpiringDocsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpiringDoc[]>('/api/gov-integrations/expiring/iqama');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إقامات منتهية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إقامات منتهية الصلاحية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد إقامات منتهية" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 30;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: urgent ? 3 : 0, borderRightColor: '#EF4444', padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                {item.daysLeft != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: urgent ? '#EF4444' : '#F59E0B' }}>{item.daysLeft} يوم</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.nationality ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.nationality}</Text> : null}
                {item.iqamaNumber ? <Text style={{ fontSize: 12, color: c.brand }}>{item.iqamaNumber}</Text> : null}
                {item.expiryDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.expiryDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
