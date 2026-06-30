/**
 * المستأجرون
 * GET /api/properties/tenants
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Tenant {
  id: number;
  name?: string;
  phone?: string;
  unitNumber?: string;
  propertyName?: string;
  leaseStart?: string;
  leaseEnd?: string;
  monthlyRent?: number;
  currency?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TenantsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Tenant[]>('/api/properties/tenants');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المستأجرين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المستأجرون' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد مستأجرون" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/properties/tenant-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.unitNumber ? <Text style={{ fontSize: 12, color: c.brand }}>وحدة {item.unitNumber}</Text> : null}
              {item.propertyName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.propertyName}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.monthlyRent != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.monthlyRent.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}/شهر</Text> : null}
              {item.leaseEnd ? <Text style={{ fontSize: 11, color: c.textFaint }}>ينتهي: {fmtDate(item.leaseEnd)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
