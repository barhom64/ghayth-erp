/**
 * القضايا القانونية
 * GET /api/legal/cases
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalCase {
  id: number;
  caseNumber?: string;
  title?: string;
  type?: string;
  court?: string;
  clientName?: string;
  opposingParty?: string;
  lawyer?: string;
  nextSession?: string;
  status?: string;
  claimAmount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function LegalCasesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<LegalCase[]>('/api/legal/cases');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القضايا…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القضايا القانونية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="scale-outline" title="لا توجد قضايا" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/legal/case-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.caseNumber ? <Text style={{ fontSize: 11, color: c.brand }}>#{item.caseNumber}</Text> : null}
              {item.type ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type}</Text> : null}
            </View>
            {item.court ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.court}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.lawyer ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.lawyer}</Text> : null}
              {item.claimAmount != null ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.claimAmount.toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
              {item.nextSession ? (
                <Text style={{ fontSize: 11, color: '#F59E0B' }}>الجلسة: {fmtDate(item.nextSession)}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
