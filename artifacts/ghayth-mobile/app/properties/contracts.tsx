/**
 * عقود الأملاك
 * GET /api/properties/contracts
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertyContract {
  id: number;
  contractNumber?: string;
  tenantName?: string;
  unitNumber?: string;
  propertyName?: string;
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  currency?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PropertyContractsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PropertyContract[]>('/api/properties/contracts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عقود الأملاك' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد عقود" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/properties/contract-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.contractNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.tenantName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.unitNumber ? <Text style={{ fontSize: 12, color: c.brand }}>{item.unitNumber}</Text> : null}
              {item.propertyName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.propertyName}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.monthlyRent != null ? <Text style={{ fontSize: 12, color: c.text, fontWeight: '700' }}>{item.monthlyRent.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}/شهر</Text> : null}
              {item.endDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.endDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
