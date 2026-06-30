/**
 * تفاصيل الحملة التسويقية
 * GET /api/marketing/campaigns/:id
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';
import { statusBadge } from '@/lib/moduleSections';

interface Campaign {
  id: number;
  name?: string;
  type?: string;
  channel?: string;
  status?: string;
  budget?: number;
  spent?: number;
  revenue?: number;
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  description?: string;
}

interface Roas { roas?: number; revenue?: number; budget?: number; spent?: number }

function fmtMoney(val?: number): string {
  if (!val && val !== 0) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return val; }
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
      <Text style={{ fontSize: 13, color: c.text, flex: 1 }}>{value}</Text>
      <Text style={{ fontSize: 13, color: c.textMuted }}>{label}</Text>
    </View>
  );
}

export default function CampaignDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, isError } = useList<Campaign>(`/api/marketing/campaigns/${id}`);
  const { data: roasData } = useList<Roas>(`/api/marketing/campaigns/${id}/roas`);
  const { refreshing, onRefresh } = useRefresh([[`/api/marketing/campaigns/${id}`], [`/api/marketing/campaigns/${id}/roas`]]);

  const item = Array.isArray(data) ? data[0] : data as Campaign | null;
  const roas = roasData as Roas | null;

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const st = statusBadge(item.status ?? '');
  const roasVal = roas?.roas ?? (item.budget && item.budget > 0 ? (item.revenue ?? 0) / item.budget : null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.name ?? 'الحملة' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard style={{ gap: 0, padding: 0 }}>
          <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'right', flex: 1 }}>{item.name}</Text>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
          </View>
          <Row label="النوع" value={item.type ?? '—'} />
          <Row label="القناة" value={item.channel ?? '—'} />
          <Row label="الجمهور المستهدف" value={item.targetAudience ?? '—'} />
          <Row label="تاريخ البداية" value={fmtDate(item.startDate)} />
          <Row label="تاريخ النهاية" value={fmtDate(item.endDate)} />
        </GCard>

        <GCard>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>الأداء المالي</Text>
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand, textAlign: 'center' }}>{fmtMoney(item.budget)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>الميزانية</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444', textAlign: 'center' }}>{fmtMoney(item.spent)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>المصروف</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#22C55E', textAlign: 'center' }}>{fmtMoney(item.revenue)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>الإيراد</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand, textAlign: 'center' }}>
                {roasVal ? `${Number(roasVal).toFixed(2)}×` : '—'}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>ROAS</Text>
            </View>
          </View>
        </GCard>

        {item.description ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>الوصف</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', lineHeight: 22 }}>{item.description}</Text>
          </GCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: '40%', borderRadius: 10, padding: 14, alignItems: 'center' },
});
