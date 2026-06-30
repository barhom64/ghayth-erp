/**
 * تفاصيل فرصة البيع — سير المراحل + الأنشطة + المتابعات
 * GET /api/crm/opportunities/:id
 * GET /api/crm/opportunities/:id/activities?pageSize=10
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'activities';

interface Opportunity {
  id: number;
  title?: string;
  name?: string;
  stage?: string;
  status?: string;
  value?: number;
  probability?: number;
  expectedCloseDate?: string;
  clientName?: string;
  assigneeName?: string;
  source?: string;
  type?: string;
  description?: string;
  createdAt?: string;
  lastActivityAt?: string;
}

interface Activity {
  id: number;
  type?: string;
  subject?: string;
  title?: string;
  notes?: string;
  date?: string;
  dueDate?: string;
  status?: string;
  assigneeName?: string;
}

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_LABELS: Record<string, string> = {
  lead: 'عميل محتمل', qualified: 'مؤهّل', proposal: 'عرض سعر',
  negotiation: 'تفاوض', won: 'مُغلق مكسب', lost: 'مُغلق خسارة',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

export default function OpportunityDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: opp, isLoading: oppLoading } = useList<Opportunity>(`/api/crm/opportunities/${id}`);
  const { data: actsResp, isLoading: actsLoading } = useList<{ data?: Activity[] }>(
    `/api/crm/opportunities/${id}/activities`, { pageSize: 10 }, { enabled: tab === 'activities' }
  );

  if (oppLoading) return <GLoadingState text="جارٍ تحميل الفرصة…" />;
  if (!opp) return <GEmptyState icon="trending-up-outline" title="فرصة غير موجودة" description="تعذّر العثور على بيانات الفرصة" />;

  const name = opp.title ?? opp.name ?? '—';
  const st = statusBadge(opp.stage ?? opp.status ?? '');
  const stageIdx = STAGE_ORDER.indexOf(opp.stage ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'information-circle-outline' },
    { key: 'activities', label: 'الأنشطة', icon: 'list-outline' },
  ];

  const activities = actsResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {opp.clientName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{opp.clientName}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 6, gap: 10 }}>
            {st ? <GStatusBadge status={STAGE_LABELS[opp.stage ?? ''] ?? st.label} size="sm" /> : null}
            {opp.probability !== undefined ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA' }}>{opp.probability}% احتمالية</Text> : null}
          </View>
        </View>
        {opp.value !== undefined && (
          <View style={styles.valueBox}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(opp.value)}</Text>
          </View>
        )}
      </View>

      {/* مسار المراحل */}
      {stageIdx >= 0 && (
        <View style={[styles.pipeline, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          {STAGE_ORDER.filter(s => !['won', 'lost'].includes(s)).map((stage, i) => {
            const isActive = stageIdx >= i && !['won', 'lost'].includes(opp.stage ?? '');
            const isWon = opp.stage === 'won' && i === 3;
            return (
              <React.Fragment key={stage}>
                <View style={[styles.stageStep, isActive || isWon ? { backgroundColor: c.brand } : { backgroundColor: c.border }]}>
                  <Text style={{ fontSize: 9, color: isActive || isWon ? '#FFF' : c.textMuted, textAlign: 'center', fontWeight: '600' }}>
                    {STAGE_LABELS[stage] ?? stage}
                  </Text>
                </View>
                {i < 3 && <View style={[styles.stageLine, { backgroundColor: stageIdx > i ? c.brand : c.border }]} />}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'المرحلة', value: STAGE_LABELS[opp.stage ?? ''] ?? opp.stage },
              { label: 'قيمة الصفقة', value: fmtMoney(opp.value) },
              { label: 'الاحتمالية', value: opp.probability !== undefined ? `${opp.probability}%` : undefined },
              { label: 'تاريخ الإغلاق المتوقع', value: fmtDate(opp.expectedCloseDate) },
              { label: 'المسؤول', value: opp.assigneeName },
              { label: 'المصدر', value: opp.source },
              { label: 'النوع', value: opp.type },
              { label: 'تاريخ الإنشاء', value: fmtDate(opp.createdAt) },
              { label: 'آخر نشاط', value: fmtDate(opp.lastActivityAt) },
              { label: 'الوصف', value: opp.description },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'activities' && (
          actsLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          activities.length === 0 ? <GEmptyState icon="list-outline" title="لا أنشطة" description="لا توجد أنشطة مسجّلة لهذه الفرصة" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {activities.map((act, i) => {
              const st = statusBadge(act.status ?? '');
              return (
                <View key={act.id} style={[styles.listRow, { borderBottomColor: c.border }, i === activities.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{act.subject ?? act.title ?? act.type ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(act.date ?? act.dueDate)}{act.assigneeName ? ` · ${act.assigneeName}` : ''}
                    </Text>
                    {act.notes ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }} numberOfLines={2}>{act.notes}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, gap: 12 },
  valueBox: { alignItems: 'center', justifyContent: 'center' },
  pipeline: { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
  stageStep: { flex: 1, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', padding: 4 },
  stageLine: { width: 8, height: 2 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
