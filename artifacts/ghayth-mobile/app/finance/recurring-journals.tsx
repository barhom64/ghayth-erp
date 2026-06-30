/**
 * القيود الدورية
 * GET /api/finance/recurring-journals
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecurringJournal {
  id: number;
  description?: string;
  frequency?: string;
  amount?: number;
  currency?: string;
  nextPostDate?: string;
  isActive?: boolean;
  profileType?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function RecurringJournalsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RecurringJournal[]>('/api/finance/recurring-journals');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القيود الدورية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القيود الدورية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="repeat-outline" title="لا توجد قيود دورية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.description ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.frequency ? <Text style={{ fontSize: 12, color: c.brand }}>{item.frequency}</Text> : null}
              {item.profileType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.profileType}</Text> : null}
              {item.nextPostDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>التالي: {fmtDate(item.nextPostDate)}</Text> : null}
            </View>
            {item.amount != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 4 }}>
                {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
