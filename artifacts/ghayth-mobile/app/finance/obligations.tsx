/**
 * الالتزامات المالية
 * GET /api/finance/obligations
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceObligation {
  id: number;
  referenceNumber?: string;
  description?: string;
  partyName?: string;
  obligationType?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FinanceObligationsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FinanceObligation[]>('/api/finance/obligations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الالتزامات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الالتزامات المالية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="alert-outline" title="لا توجد التزامات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/obligation-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.referenceNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.referenceNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.description ?? item.partyName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.partyName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.partyName}</Text> : null}
              {item.obligationType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.obligationType}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.dueDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>استحقاق: {fmtDate(item.dueDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
