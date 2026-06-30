/**
 * امتثال الموارد البشرية — قائمة مخالفات الامتثال وحالات التحقيق
 * GET /api/hr/compliance
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ComplianceCase {
  id: number;
  type?: string;
  employeeName?: string;
  reportedAt?: string;
  status?: string;
  severity?: string;
  summary?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function HrComplianceScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<ComplianceCase[]>('/api/hr/compliance');
  const cases = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حالات الامتثال…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'امتثال الموارد البشرية' }} />
      <FlatList
        data={cases}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="shield-checkmark-outline" title="لا توجد حالات" description="لا توجد حالات امتثال مسجّلة" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const sevColor = SEVERITY_COLOR[item.severity ?? ''] ?? c.textMuted;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderBottomColor: c.border }]}
              onPress={() => undefined}
            >
              <View style={[styles.severityBar, { backgroundColor: sevColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.type ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.employeeName ?? '—'} · {fmtDate(item.reportedAt)}
                </Text>
                {item.summary ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  severityBar: { width: 4, height: '100%', borderRadius: 2, minHeight: 40 },
});
