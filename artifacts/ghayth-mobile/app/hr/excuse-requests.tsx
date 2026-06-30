/**
 * طلبات الاستئذان
 * GET /api/hr/excuse-requests
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExcuseRequest {
  id: number;
  employeeName?: string;
  excuseDate?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ExcuseRequestsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<ExcuseRequest[]>('/api/hr/excuse-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات الاستئذان…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الاستئذان' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد طلبات استئذان" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/excuse-request-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.excuseDate ? <Text style={{ fontSize: 12, color: c.brand }}>{fmtDate(item.excuseDate)}</Text> : null}
              {item.startTime && item.endTime ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.startTime} — {item.endTime}</Text> : null}
            </View>
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.reason}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
