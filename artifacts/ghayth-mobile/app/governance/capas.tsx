/**
 * الإجراءات التصحيحية والوقائية (CAPA)
 * GET /api/governance/capas
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Capa {
  id: number;
  title?: string;
  type?: string;
  source?: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: string;
  closedAt?: string;
  status?: string;
  isOverdue?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GovernanceCAPAsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Capa[]>('/api/governance/capas');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل CAPAs…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإجراءات التصحيحية والوقائية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد إجراءات مفتوحة" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/governance/capa-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
          >
            {item.isOverdue ? <View style={{ width: 4, backgroundColor: '#EF4444', borderRadius: 2, alignSelf: 'stretch' }} /> : null}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.type ? <Text style={{ fontSize: 12, color: c.brand }}>{item.type}</Text> : null}
                {item.source ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.source}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.assignedTo ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.assignedTo}</Text> : null}
                {item.dueDate ? (
                  <Text style={{ fontSize: 11, color: item.isOverdue ? '#EF4444' : c.textFaint }}>
                    الموعد: {fmtDate(item.dueDate)}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
