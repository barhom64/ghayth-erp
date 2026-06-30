/**
 * التقارير المجدولة
 * GET /api/scheduled-reports
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ScheduledReport {
  id: number;
  name?: string;
  reportType?: string;
  frequency?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  status?: string;
  recipients?: string[];
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ScheduledReportsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduledReport[]>('/api/scheduled-reports');
  const reports = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقارير المجدولة…" />;
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
      <Stack.Screen options={{ title: 'التقارير المجدولة' }} />
      <FlatList
        data={reports}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="time-outline" title="لا توجد تقارير مجدولة" description="لا توجد تقارير مجدولة مُعدَّة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={[styles.iconBox, { backgroundColor: c.brand + '20' }]}>
                <Ionicons name="document-text-outline" size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.name ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {FREQ_LABEL[item.frequency ?? ''] ?? item.frequency ?? '—'} · التالي: {fmtDate(item.nextRunAt)}
                </Text>
                {item.recipients && item.recipients.length > 0 ? (
                  <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                    {item.recipients.length} مستلم
                  </Text>
                ) : null}
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
