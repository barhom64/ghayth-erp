import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Subscription {
  plan?: string;
  status?: string;
  expiresAt?: string;
  userLimit?: number;
  activeUsers?: number;
  features?: string[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SubscriptionScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Subscription>('/api/admin/subscription');

  if (isLoading) return <GLoadingState text="جارٍ تحميل الاشتراك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = (Array.isArray(data) ? data[0] : data) as Subscription | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الاشتراك' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.brand }}>{d?.plan ?? '—'}</Text>
            <GStatusBadge status={d?.status ?? ''} />
          </View>
          {[
            { label: 'تنتهي في', value: fmtDate(d?.expiresAt) },
            { label: 'حد المستخدمين', value: String(d?.userLimit ?? '—') },
            { label: 'المستخدمون النشطون', value: String(d?.activeUsers ?? '—') },
          ].map(row => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{row.value}</Text>
            </View>
          ))}
        </View>
        {(d?.features ?? []).length > 0 && (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>الميزات المفعّلة</Text>
            {(d?.features ?? []).map((f, i) => (
              <Text key={i} style={{ fontSize: 12, color: '#22C55E', textAlign: 'right', paddingVertical: 4 }}>✓ {f}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
