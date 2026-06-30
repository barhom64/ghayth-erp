/**
 * مخاطر المشاريع
 * GET /api/projects/risks
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectRisk {
  id: number;
  projectName?: string;
  title?: string;
  description?: string;
  likelihood?: string;
  impact?: string;
  riskScore?: number;
  mitigation?: string;
  owner?: string;
  status?: string;
  identifiedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

function scoreColor(score?: number): string {
  if (!score) return '#94A3B8';
  if (score >= 15) return '#DC2626';
  if (score >= 9) return '#EF4444';
  if (score >= 4) return '#F59E0B';
  return '#22C55E';
}

export default function ProjectRisksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectRisk[]>('/api/projects/risks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المخاطر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخاطر المشاريع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد مخاطر مسجلة" description="" />}
        renderItem={({ item }) => {
          const color = scoreColor(item.riskScore);
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
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
                {item.projectName ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.projectName}</Text> : null}
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>{item.description}</Text>
                ) : null}
                {item.mitigation ? (
                  <Text style={{ fontSize: 11, color: '#22C55E', textAlign: 'right', marginTop: 4 }}>الإجراء: {item.mitigation}</Text>
                ) : null}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.owner ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.owner}</Text> : null}
                  {item.identifiedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.identifiedAt)}</Text> : null}
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
