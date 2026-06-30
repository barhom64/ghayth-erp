/**
 * تقارير العمرة — رحلات المجموعات والوكلاء
 * GET /api/umrah/reports/recovery-hub
 */
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

type ReportTab = 'recovery' | 'pricing';

interface RecoveryItem {
  type?: string;
  label?: string;
  count?: number;
  amount?: number;
  currency?: string;
  groupId?: number;
  groupName?: string;
}

interface PricingDrift {
  groupId?: number;
  groupName?: string;
  packageName?: string;
  driftAmount?: number;
  currency?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (!val) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function UmrahReportsScreen() {
  const c = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<ReportTab>('recovery');

  const { data: recovery, isLoading: loadR } = useList<RecoveryItem[]>('/api/umrah/reports/recovery-hub');
  const { data: pricing, isLoading: loadP } = useList<PricingDrift[]>('/api/umrah/reports/packages-vs-allocations-pricing-drift');
  const { refreshing, onRefresh } = useRefresh([['/api/umrah/reports/recovery-hub'], ['/api/umrah/reports/packages-vs-allocations-pricing-drift']]);

  const recoveryList = Array.isArray(recovery) ? recovery : [];
  const pricingList = Array.isArray(pricing) ? pricing : [];
  const isLoading = tab === 'recovery' ? loadR : loadP;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقارير العمرة' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {[
          { key: 'recovery' as const, label: 'الاسترداد والمطالبات' },
          { key: 'pricing' as const, label: 'انحراف التسعير' },
        ].map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ تحميل التقرير…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {tab === 'recovery' ? (
            recoveryList.length === 0 ? (
              <GEmptyState icon="document-text-outline" title="لا توجد بنود" description="لا توجد مطالبات استرداد حالياً" />
            ) : (
              <GCard style={{ gap: 0, padding: 0 }}>
                {recoveryList.map((item, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [styles.row, { borderBottomColor: c.border, backgroundColor: pressed ? c.surfaceAlt : c.surface }, i === recoveryList.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={item.groupId ? () => router.push({ pathname: '/umrah/group-detail' as never, params: { id: String(item.groupId) } }) : undefined}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.label ?? item.type ?? '—'}</Text>
                      {item.groupName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.groupName}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {item.count ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.count}</Text> : null}
                      {item.amount ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{fmtMoney(item.amount, item.currency)}</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </GCard>
            )
          ) : (
            pricingList.length === 0 ? (
              <GEmptyState icon="analytics-outline" title="لا توجد انحرافات" description="التسعير متوافق مع التخصيصات" />
            ) : (
              <GCard style={{ gap: 0, padding: 0 }}>
                {pricingList.map((item, i) => (
                  <View key={i} style={[styles.row, { borderBottomColor: c.border }, i === pricingList.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.groupName ?? '—'}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.packageName ?? ''}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: (item.driftAmount ?? 0) > 0 ? '#EF4444' : '#22C55E' }}>
                      {fmtMoney(item.driftAmount, item.currency)}
                    </Text>
                  </View>
                ))}
              </GCard>
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1 },
});
