/**
 * العملاء المحتملون
 * GET /api/crm/leads
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Lead {
  id: number;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  stage?: string;
  score?: number;
  assignedTo?: string;
  createdAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const SCORE_COLOR = (score?: number) => {
  if (!score) return '#94A3B8';
  if (score >= 80) return '#22C55E';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
};

export default function CrmLeadsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Lead[]>('/api/crm/leads');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العملاء المحتملين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العملاء المحتملون' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-add-outline" title="لا توجد عملاء محتملون" description="" />}
        renderItem={({ item }) => {
          const sc = SCORE_COLOR(item.score);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/crm/lead-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              {item.score != null ? (
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: sc + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: sc }}>{item.score}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  {item.company ? <Text style={{ fontSize: 12, color: c.brand }}>{item.company}</Text> : null}
                  {item.source ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.source}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.assignedTo ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.assignedTo}</Text> : null}
                  {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
