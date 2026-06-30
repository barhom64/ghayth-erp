/**
 * طلبات الصيانة — العقارات
 * GET /api/properties/maintenance-requests
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MaintenanceRequest {
  id: number;
  requestNumber?: string;
  propertyName?: string;
  unitNumber?: string;
  tenantName?: string;
  category?: string;
  description?: string;
  priority?: string;
  status?: string;
  assignedTo?: string;
  scheduledAt?: string;
  completedAt?: string;
  cost?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
};

export default function PropertyMaintenanceRequestsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<MaintenanceRequest[]>('/api/properties/maintenance-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات الصيانة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الصيانة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="build-outline" title="لا توجد طلبات صيانة" description="" />}
        renderItem={({ item }) => {
          const pColor = PRIORITY_COLOR[item.priority ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/properties/maintenance-request-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                    {item.propertyName ?? '—'}{item.unitNumber ? ` — ${item.unitNumber}` : ''}
                  </Text>
                  <GStatusBadge status={item.status ?? ''} />
                </View>
                {item.category ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.description}</Text>
                ) : null}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.tenantName ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.tenantName}</Text> : null}
                  {item.cost != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.cost.toLocaleString('ar-SA')} ر.س</Text> : null}
                  {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
