/**
 * تفاصيل مجموعة العمرة — معلومات + معتمرون + مدفوعات
 * GET /api/umrah/groups/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahGroup {
  id: number;
  name?: string;
  groupNumber?: string;
  season?: string;
  packageName?: string;
  departureDate?: string;
  returnDate?: string;
  status?: string;
  capacity?: number;
  enrolledCount?: number;
  agentName?: string;
  totalRevenue?: number;
  collectedAmount?: number;
  remainingAmount?: number;
  currency?: string;
  pilgrims?: Pilgrim[];
  notes?: string;
}

interface Pilgrim {
  id?: number;
  name?: string;
  passportNumber?: string;
  nationality?: string;
  status?: string;
  paidAmount?: number;
  remainingAmount?: number;
}

type Tab = 'info' | 'pilgrims' | 'financials';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function UmrahGroupDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: group, isLoading } = useList<UmrahGroup>(`/api/umrah/groups/${id}`);
  const { data: pilgrims } = useList<Pilgrim[]>(`/api/umrah/pilgrims?groupId=${id}`, undefined, { enabled: tab === 'pilgrims' });

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المجموعة…" />;
  if (!group) return <GEmptyState icon="albums-outline" title="مجموعة غير موجودة" description="تعذّر العثور على بيانات المجموعة" />;

  const name = group.name ?? group.groupNumber ?? `#${group.id}`;
  const st = statusBadge(group.status ?? '');
  const currency = group.currency;
  const pilgrimList = group.pilgrims ?? (Array.isArray(pilgrims) ? pilgrims : []);
  const fillPct = group.capacity && group.enrolledCount ? Math.min((group.enrolledCount / group.capacity) * 100, 100) : 0;
  const collectedPct = group.totalRevenue && group.collectedAmount ? Math.min((group.collectedAmount / group.totalRevenue) * 100, 100) : 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'pilgrims', label: `المعتمرون (${group.enrolledCount ?? 0})` },
    { key: 'financials', label: 'المالية' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {group.packageName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{group.packageName}</Text> : null}
          {group.season ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{group.season}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Ionicons name="people" size={32} color={c.onPrimary + 'CC'} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{group.enrolledCount ?? 0}/{group.capacity ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'CC' }}>معتمر</Text>
        </View>
      </View>

      {/* شريط الامتلاء */}
      <View style={[styles.fillBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>امتلاء المجموعة</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>{Math.round(fillPct)}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { width: `${fillPct}%`, backgroundColor: fillPct >= 100 ? '#22C55E' : c.brand }]} />
        </View>
      </View>

      {/* التبويبات */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'الوكيل', value: group.agentName },
              { label: 'تاريخ السفر', value: fmtDate(group.departureDate) },
              { label: 'تاريخ العودة', value: fmtDate(group.returnDate) },
              { label: 'الطاقة الاستيعابية', value: group.capacity ? `${group.capacity} معتمر` : undefined },
              { label: 'المسجلون', value: group.enrolledCount ? `${group.enrolledCount} معتمر` : undefined },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'pilgrims' && (
          pilgrimList.length === 0
            ? <GEmptyState icon="people-outline" title="لا يوجد معتمرون" description="لم يتم تسجيل أي معتمرين في هذه المجموعة" />
            : pilgrimList.map((p, i) => (
              <GCard key={p.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{p.passportNumber ?? '—'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{p.name ?? '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: (p.remainingAmount ?? 0) > 0 ? '#EF4444' : '#22C55E' }}>
                    {(p.remainingAmount ?? 0) > 0 ? `متبقي: ${fmtMoney(p.remainingAmount, currency)}` : 'مكتمل الدفع'}
                  </Text>
                  {p.status ? <GStatusBadge status={p.status} size="sm" /> : null}
                </View>
              </GCard>
            ))
        )}

        {tab === 'financials' && (
          <>
            <View style={[styles.finSummary, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.finItem}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{fmtMoney(group.totalRevenue, currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>إجمالي الإيرادات</Text>
              </View>
              <View style={[styles.finDivider, { backgroundColor: c.border }]} />
              <View style={styles.finItem}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(group.collectedAmount, currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>المحصّل</Text>
              </View>
              <View style={[styles.finDivider, { backgroundColor: c.border }]} />
              <View style={styles.finItem}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: (group.remainingAmount ?? 0) > 0 ? '#EF4444' : c.text }}>
                  {fmtMoney(group.remainingAmount, currency)}
                </Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>المتبقي</Text>
              </View>
            </View>
            <View style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: c.textMuted }}>نسبة التحصيل</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>{Math.round(collectedPct)}%</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                <View style={[styles.progressFill, { width: `${collectedPct}%`, backgroundColor: collectedPct >= 100 ? '#22C55E' : c.brand }]} />
              </View>
            </View>
          </>
        )}

        {group.notes && (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{group.notes}</Text>
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  fillBar: { padding: 12, borderBottomWidth: 1 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  finSummary: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, paddingVertical: 16 },
  finItem: { flex: 1, alignItems: 'center' },
  finDivider: { width: 1, marginVertical: 4 },
});
