/**
 * تفاصيل عملية التدقيق
 * GET /api/governance/audits/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Audit {
  id: number;
  ref?: string;
  title?: string;
  auditType?: string;
  scope?: string;
  auditor?: string;
  auditee?: string;
  department?: string;
  status?: string;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  objective?: string;
  methodology?: string;
  conclusion?: string;
  overallRating?: string;
  findings?: AuditFinding[];
  recommendations?: string;
}

interface AuditFinding {
  id?: number;
  title?: string;
  severity?: string;
  status?: string;
  description?: string;
  recommendation?: string;
}

type Tab = 'info' | 'findings';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22C55E', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED',
};

export default function AuditDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: audit, isLoading } = useList<Audit>(`/api/governance/audits/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات التدقيق…" />;
  if (!audit) return <GEmptyState icon="search-outline" title="تدقيق غير موجود" description="تعذّر العثور على بيانات التدقيق" />;

  const ref = audit.ref ?? `#${audit.id}`;
  const st = statusBadge(audit.status ?? '');
  const findings = audit.findings ?? [];

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'findings', label: `المشاهدات (${findings.length})` },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `تدقيق ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{audit.title ?? '—'}</Text>
          {audit.auditType ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{audit.auditType}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {audit.overallRating ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: c.onPrimary, fontWeight: '600' }}>التقييم: {audit.overallRating}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="search-outline" size={40} color={c.onPrimary + '80'} />
      </View>

      {/* التبويبات */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {tab === 'info' && (
          <>
            <GCard style={{ gap: 0, padding: 0 }}>
              {[
                { label: 'المدقق', value: audit.auditor },
                { label: 'الجهة المدقَّقة', value: audit.auditee },
                { label: 'القسم', value: audit.department },
                { label: 'نطاق التدقيق', value: audit.scope },
                { label: 'البداية المخططة', value: audit.plannedStart ? fmtDate(audit.plannedStart) : undefined },
                { label: 'الانتهاء المخطط', value: audit.plannedEnd ? fmtDate(audit.plannedEnd) : undefined },
                { label: 'بداية الفعلية', value: audit.actualStart ? fmtDate(audit.actualStart) : undefined },
                { label: 'نهاية الفعلية', value: audit.actualEnd ? fmtDate(audit.actualEnd) : undefined },
              ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
                </View>
              ))}
            </GCard>

            {audit.objective ? (
              <GCard>
                <GText variant="caption" color="muted">الهدف</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{audit.objective}</Text>
              </GCard>
            ) : null}

            {audit.conclusion ? (
              <GCard>
                <GText variant="caption" color="muted">الخلاصة</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{audit.conclusion}</Text>
              </GCard>
            ) : null}

            {audit.recommendations ? (
              <GCard>
                <GText variant="caption" color="muted">التوصيات</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{audit.recommendations}</Text>
              </GCard>
            ) : null}
          </>
        )}

        {tab === 'findings' && (
          findings.length === 0
            ? <GEmptyState icon="checkmark-circle-outline" title="لا توجد مشاهدات" description="لم يتم تسجيل أي مشاهدات لهذه العملية" />
            : findings.map((f, i) => {
              const sev = (f.severity ?? '').toLowerCase();
              const sevColor = SEVERITY_COLOR[sev] ?? c.textMuted;
              return (
                <GCard key={f.id ?? i} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ backgroundColor: sevColor + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, color: sevColor, fontWeight: '700' }}>{f.severity ?? '—'}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', flex: 1, marginRight: 8 }}>{f.title ?? '—'}</Text>
                  </View>
                  {f.description ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{f.description}</Text> : null}
                  {f.recommendation ? (
                    <View style={{ backgroundColor: c.surface, borderRadius: 6, padding: 8 }}>
                      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>التوصية: {f.recommendation}</Text>
                    </View>
                  ) : null}
                </GCard>
              );
            })
        )}
        <GButton
          title="إجراء تصحيحي (CAPA)"
          icon="build-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/governance/capa-new' as never, params: { auditId: id } })}
          style={{ marginTop: 8 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
