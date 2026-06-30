/**
 * الجزاءات والمخالفات
 * GET /api/hr/disciplinary
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisciplinaryRecord {
  id: number;
  employeeName?: string;
  violationType?: string;
  severity?: string;
  description?: string;
  penalty?: string;
  penaltyAmount?: number;
  occurredAt?: string;
  status?: string;
  resolvedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: '#F59E0B',
  moderate: '#F97316',
  serious: '#EF4444',
  critical: '#DC2626',
};

export default function DisciplinaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DisciplinaryRecord[]>('/api/hr/disciplinary');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الجزاءات والمخالفات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد مخالفات" description="" />}
        renderItem={({ item }) => {
          const sColor = SEVERITY_COLOR[item.severity ?? ''] ?? '#94A3B8';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
              <View style={{ width: 4, backgroundColor: sColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                </View>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.violationType ?? '—'}</Text>
                {item.penalty ? <Text style={{ fontSize: 12, color: sColor, textAlign: 'right', marginTop: 2 }}>الجزاء: {item.penalty}</Text> : null}
                {item.penaltyAmount ? (
                  <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'right' }}>{item.penaltyAmount.toLocaleString('ar-SA')} ر.س</Text>
                ) : null}
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.occurredAt)}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
