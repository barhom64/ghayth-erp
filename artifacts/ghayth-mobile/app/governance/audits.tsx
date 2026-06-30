/**
 * التدقيق والمراجعة
 * GET /api/governance/audits
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Audit {
  id: number;
  title?: string;
  type?: string;
  scope?: string;
  auditor?: string;
  scheduledAt?: string;
  completedAt?: string;
  status?: string;
  findings?: number;
  criticalFindings?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GovernanceAuditsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Audit[]>('/api/governance/audits');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التدقيق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التدقيق والمراجعة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="search-outline" title="لا توجد عمليات تدقيق" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/governance/audit-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.type ? <Text style={{ fontSize: 12, color: c.brand }}>{item.type}</Text> : null}
              {item.scope ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.scope}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.auditor ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.auditor}</Text> : null}
              {item.findings != null ? (
                <Text style={{ fontSize: 12, color: item.criticalFindings ? '#EF4444' : c.text }}>
                  {item.findings} نتيجة{item.criticalFindings ? ` (${item.criticalFindings} حرجة)` : ''}
                </Text>
              ) : null}
              {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
