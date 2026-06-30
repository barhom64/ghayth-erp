/**
 * تفاصيل العميل المحتمل (Lead)
 * GET /api/crm/pipeline/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Lead {
  id: number;
  ref?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  stage?: string;
  status?: string;
  assignedTo?: string;
  estimatedValue?: number;
  currency?: string;
  expectedCloseDate?: string;
  createdAt?: string;
  lastContactDate?: string;
  notes?: string;
  tags?: string[];
  activities?: { id: number; type?: string; title?: string; date?: string; notes?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

const STAGE_COLORS: Record<string, string> = {
  new: '#3B82F6', contacted: '#8B5CF6', qualified: '#F59E0B',
  proposal: '#F97316', negotiation: '#EF4444', won: '#22C55E', lost: '#6B7280',
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', email: '📧', meeting: '🤝', note: '📝', task: '✅',
};

export default function LeadDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: lead, isLoading } = useList<Lead>(`/api/crm/pipeline/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات العميل…" />;
  if (!lead) return <GEmptyState icon="person-add-outline" title="عميل غير موجود" description="تعذّر العثور على بيانات العميل المحتمل" />;

  const ref = lead.ref ?? `#${lead.id}`;
  const st = statusBadge(lead.status ?? lead.stage ?? '');
  const stageColor = STAGE_COLORS[(lead.stage ?? '').toLowerCase()] ?? c.brand;
  const activities = lead.activities ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: lead.name ?? 'العميل المحتمل' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: stageColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{lead.name ?? '—'}</Text>
          {lead.company ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{lead.company}</Text> : null}
          {lead.jobTitle ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{lead.jobTitle}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {lead.source ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF' }}>{lead.source}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {lead.estimatedValue !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(lead.estimatedValue, lead.currency)}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>القيمة المتوقعة</Text>
          </View>
        ) : <Ionicons name="person-add-outline" size={40} color="#FFFFFF80" />}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* تواصل */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'البريد الإلكتروني', value: lead.email },
            { label: 'الهاتف', value: lead.phone },
            { label: 'المسؤول', value: lead.assignedTo },
            { label: 'تاريخ الإغلاق المتوقع', value: lead.expectedCloseDate ? fmtDate(lead.expectedCloseDate) : undefined },
            { label: 'آخر تواصل', value: lead.lastContactDate ? fmtDate(lead.lastContactDate) : undefined },
            { label: 'تاريخ الإضافة', value: lead.createdAt ? fmtDate(lead.createdAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {lead.tags && lead.tags.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الوسوم</GText>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {lead.tags.map((tag, i) => (
                <View key={i} style={{ backgroundColor: c.brand + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: c.brand }}>{tag}</Text>
                </View>
              ))}
            </View>
          </GCard>
        )}

        {lead.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{lead.notes}</Text>
          </GCard>
        ) : null}

        <View style={{ gap: 8 }}>
          <GButton title="تسجيل نشاط متابعة" icon="add-circle-outline" variant="secondary" onPress={() => router.push({ pathname: '/crm/activity-new' as never, params: { leadId: id } })} />
          <GButton title="تحويل لفرصة بيعية" icon="trending-up-outline" variant="secondary" onPress={() => router.push({ pathname: '/crm/opportunity-new' as never, params: { leadId: id } })} />
        </View>

        {activities.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">سجل الأنشطة ({activities.length})</GText>
            {activities.map((act, i) => (
              <View key={act.id ?? i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(act.date)}</Text>
                  <Text style={{ fontSize: 14, flex: 1, textAlign: 'right' }}>
                    {ACTIVITY_ICONS[act.type ?? ''] ?? '•'} {act.title ?? act.type ?? '—'}
                  </Text>
                </View>
                {act.notes ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{act.notes}</Text> : null}
              </View>
            ))}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
