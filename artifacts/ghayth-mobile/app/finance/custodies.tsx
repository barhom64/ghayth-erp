/**
 * العهد المالية
 * GET /api/finance/custodies
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Custody {
  id: number;
  referenceNumber?: string;
  employeeName?: string;
  amount?: number;
  currency?: string;
  purpose?: string;
  issuedAt?: string;
  settledAmount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CustodiesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Custody[]>('/api/finance/custodies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العهد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العهد المالية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد عهد" description="" />}
        renderItem={({ item }) => {
          const remaining = (item.amount ?? 0) - (item.settledAmount ?? 0);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/finance/custody-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.referenceNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.referenceNumber}</Text> : null}
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.purpose ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.purpose}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.amount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>المبلغ: {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {remaining > 0 ? <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>المتبقي: {remaining.toLocaleString('ar-SA')}</Text> : null}
                {item.issuedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.issuedAt)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
