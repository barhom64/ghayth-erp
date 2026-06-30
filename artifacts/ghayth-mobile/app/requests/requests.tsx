/**
 * الطلبات
 * GET /api/requests
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Request {
  id: number;
  requestNumber?: string;
  requestType?: string;
  requesterName?: string;
  description?: string;
  createdAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function RequestsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Request[]>('/api/requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الطلبات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/requests/request-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.requestNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.requestNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.requesterName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.requestType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.requestType}</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
            {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
