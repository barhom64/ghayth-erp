/**
 * القيود المحاسبية
 * GET /api/finance/journals
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Journal {
  id: number;
  reference?: string;
  description?: string;
  date?: string;
  totalDebit?: number;
  currency?: string;
  status?: string;
  createdBy?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function JournalsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Journal[]>('/api/finance/journals');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القيود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القيود المحاسبية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد قيود" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/journal-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.reference ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.description ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{fmtDate(item.date)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>
                {(item.totalDebit ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
