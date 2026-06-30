/**
 * تقييمات رضا العملاء
 * GET /api/support/csat
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CsatEntry {
  id: number;
  ticketNumber?: string;
  customerName?: string;
  score?: number;
  comment?: string;
  agentName?: string;
  submittedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const SCORE_COLOR: Record<number, string> = { 1: '#EF4444', 2: '#F97316', 3: '#F59E0B', 4: '#22C55E', 5: '#16A34A' };

export default function CsatScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CsatEntry[]>('/api/support/csat');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقييمات رضا العملاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'رضا العملاء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="happy-outline" title="لا توجد تقييمات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.ticketNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.ticketNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.customerName ?? '—'}</Text>
              {item.score != null ? (
                <Text style={{ fontSize: 16, fontWeight: '700', color: SCORE_COLOR[item.score] ?? c.text }}>{item.score}/5</Text>
              ) : null}
            </View>
            {item.comment ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }} numberOfLines={2}>{item.comment}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.agentName ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.agentName}</Text> : null}
              {item.submittedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.submittedAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
