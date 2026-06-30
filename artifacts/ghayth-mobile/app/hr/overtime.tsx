/**
 * العمل الإضافي
 * GET /api/hr/overtime
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OvertimeRecord {
  id: number;
  employeeName?: string;
  department?: string;
  date?: string;
  hours?: number;
  rate?: number;
  totalAmount?: number;
  reason?: string;
  approvedBy?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function OvertimeScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<OvertimeRecord[]>('/api/hr/overtime');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العمل الإضافي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العمل الإضافي' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد سجلات عمل إضافي" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/overtime-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.brand }}>{item.department}</Text> : null}
              {item.date ? <Text style={{ fontSize: 12, color: c.textFaint }}>{fmtDate(item.date)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.hours != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.hours} ساعة</Text> : null}
              {item.totalAmount != null ? (
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.totalAmount.toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
              {item.approvedBy ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.approvedBy}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
