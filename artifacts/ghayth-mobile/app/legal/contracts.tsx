/**
 * العقود القانونية
 * GET /api/legal/contracts
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalContract {
  id: number;
  contractNumber?: string;
  title?: string;
  counterparty?: string;
  startDate?: string;
  endDate?: string;
  value?: number;
  currency?: string;
  type?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function LegalContractsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<LegalContract[]>('/api/legal/contracts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العقود القانونية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد عقود" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/legal/contract-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? item.contractNumber ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.counterparty ? <Text style={{ fontSize: 12, color: c.brand }}>{item.counterparty}</Text> : null}
              {item.type ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type}</Text> : null}
              {item.value != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>{item.value.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
            <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.startDate)} — {fmtDate(item.endDate)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
