/**
 * مخاطر الحوكمة
 * GET /api/governance/risks
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GovernanceRisk {
  id: number;
  title?: string;
  category?: string;
  likelihood?: number;
  impact?: number;
  riskScore?: number;
  owner?: string;
  status?: string;
  lastReviewedAt?: string;
}

function scoreColor(score?: number): string {
  if (!score) return '#94A3B8';
  if (score >= 15) return '#DC2626';
  if (score >= 9) return '#EF4444';
  if (score >= 4) return '#F59E0B';
  return '#22C55E';
}

export default function GovernanceRisksScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<GovernanceRisk[]>('/api/governance/risks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المخاطر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخاطر الحوكمة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد مخاطر" description="" />}
        renderItem={({ item }) => {
          const color = scoreColor(item.riskScore);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/governance/risk-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: color, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                  {item.riskScore != null ? (
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{item.riskScore}</Text>
                    </View>
                  ) : null}
                </View>
                {item.category ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.owner ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.owner}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
