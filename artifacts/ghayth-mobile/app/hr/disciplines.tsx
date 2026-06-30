/**
 * الإجراءات التأديبية
 * GET /api/hr/disciplines
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrDiscipline {
  id: number;
  employeeName?: string;
  violationType?: string;
  sanctionType?: string;
  issuedAt?: string;
  description?: string;
  status?: string;
}

const SANCTION_COLOR: Record<string, string> = {
  warning: '#F59E0B',
  suspension: '#EF4444',
  termination: '#7C3AED',
  fine: '#F97316',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function HrDisciplinesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<HrDiscipline[]>('/api/hr/disciplines');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإجراءات التأديبية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإجراءات التأديبية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="alert-outline" title="لا توجد إجراءات تأديبية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/discipline-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.sanctionType ? <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: SANCTION_COLOR[item.sanctionType] ?? c.brand }} /> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.violationType ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.violationType}</Text> : null}
              {item.sanctionType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.sanctionType}</Text> : null}
            </View>
            {item.issuedAt ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{fmtDate(item.issuedAt)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
