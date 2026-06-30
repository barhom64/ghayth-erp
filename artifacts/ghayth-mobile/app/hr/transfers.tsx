/**
 * نقل الموظفين
 * GET /api/hr/transfers
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrTransfer {
  id: number;
  employeeName?: string;
  fromDepartment?: string;
  toDepartment?: string;
  fromBranch?: string;
  toBranch?: string;
  effectiveDate?: string;
  reason?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function HrTransfersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<HrTransfer[]>('/api/hr/transfers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات النقل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نقل الموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد طلبات نقل" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/transfer-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.fromDepartment ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.fromDepartment}</Text> : null}
              {item.fromDepartment && item.toDepartment ? <Text style={{ fontSize: 12, color: c.textFaint }}>←</Text> : null}
              {item.toDepartment ? <Text style={{ fontSize: 12, color: c.brand }}>{item.toDepartment}</Text> : null}
            </View>
            {item.effectiveDate ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{fmtDate(item.effectiveDate)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
