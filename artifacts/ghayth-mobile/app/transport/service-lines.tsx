/**
 * خطوط خدمة النقل
 * GET /api/transport/service-lines
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ServiceLine {
  id: number;
  bookingNumber?: string;
  customerName?: string;
  serviceType?: string;
  unitPrice?: number;
  quantity?: number;
  totalAmount?: number;
  currency?: string;
  status?: string;
  serviceDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ServiceLinesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ServiceLine[]>('/api/transport/service-lines');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطوط الخدمة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطوط خدمة النقل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد خطوط خدمة" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.bookingNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.bookingNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.customerName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.serviceType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.serviceType}</Text> : null}
              {item.serviceDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.serviceDate)}</Text> : null}
            </View>
            {item.totalAmount != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 4 }}>
                {item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
