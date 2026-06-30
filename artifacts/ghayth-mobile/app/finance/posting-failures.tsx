import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PostingFailure {
  id: number;
  sourceType?: string;
  sourceId?: number;
  errorMessage?: string;
  occurredAt?: string;
  resolved?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PostingFailuresScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PostingFailure[]>('/api/posting-failures');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أخطاء الترحيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أخطاء الترحيل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد أخطاء ترحيل" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: item.resolved ? 0 : 3, borderRightColor: '#EF4444', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.sourceType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.sourceType}</Text> : null}
              {item.sourceId != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>#{item.sourceId}</Text> : null}
              {item.resolved ? <Text style={{ fontSize: 11, color: '#22C55E' }}>محلول</Text> : <Text style={{ fontSize: 11, color: '#EF4444' }}>غير محلول</Text>}
            </View>
            {item.errorMessage ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }} numberOfLines={2}>{item.errorMessage}</Text> : null}
            {item.occurredAt ? <Text style={{ fontSize: 10, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.occurredAt)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
