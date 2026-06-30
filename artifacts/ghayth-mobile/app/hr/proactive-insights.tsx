/**
 * التنبيهات الاستباقية الشخصية
 * GET /api/me/proactive-insights
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Insight {
  id?: string;
  category?: string;
  title?: string;
  description?: string;
  severity?: string;
  actionUrl?: string;
  dueDate?: string;
}

const CATEGORY_ICON: Record<string, string> = {
  iqama: 'card-outline',
  document: 'document-outline',
  approval: 'checkmark-circle-outline',
  journal: 'book-outline',
  invoice: 'receipt-outline',
  task: 'checkmark-done-outline',
  obligation: 'alert-outline',
  notification: 'notifications-outline',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#22C55E',
  info: '#3B82F6',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ProactiveInsightsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Insight[]>('/api/me/proactive-insights');
  const insights = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التنبيهات…" />;
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
      <Stack.Screen options={{ title: 'التنبيهات الاستباقية' }} />
      <FlatList
        data={insights}
        keyExtractor={(item, i) => item.id ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="checkmark-circle-outline" title="لا توجد تنبيهات" description="كل شيء على ما يرام — لا توجد إجراءات مطلوبة" />
        }
        renderItem={({ item }) => {
          const icon = CATEGORY_ICON[item.category ?? ''] ?? 'information-circle-outline';
          const color = SEVERITY_COLOR[item.severity ?? ''] ?? c.textMuted;
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon as never} size={18} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.title ?? '—'}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.dueDate ? (
                  <Text style={{ fontSize: 11, color: color, textAlign: 'right', marginTop: 2 }}>
                    {fmtDate(item.dueDate)}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.severityDot, { backgroundColor: color }]} />
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
  severityDot: { width: 8, height: 8, borderRadius: 4 },
});
