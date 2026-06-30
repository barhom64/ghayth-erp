/**
 * تفاصيل طلب التوظيف
 * GET /api/hr/recruitment/postings/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface RecruitmentPosting {
  id: number;
  ref?: string;
  jobTitle?: string;
  department?: string;
  branch?: string;
  status?: string;
  employmentType?: string;
  openPositions?: number;
  closingDate?: string;
  publishedDate?: string;
  salary?: string;
  requirements?: string;
  description?: string;
  responsibilities?: string;
  hrManager?: string;
  applicantsCount?: number;
  shortlistedCount?: number;
  applicants?: Applicant[];
}

interface Applicant {
  id?: number;
  name?: string;
  status?: string;
  appliedAt?: string;
  score?: number;
}

type Tab = 'info' | 'applicants';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function RecruitmentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: posting, isLoading } = useList<RecruitmentPosting>(`/api/hr/recruitment/postings/${id}`);
  const { data: applicantsData } = useList<Applicant[]>(
    `/api/hr/recruitment/applicants?postingId=${id}`, undefined, { enabled: tab === 'applicants' }
  );

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الوظيفة…" />;
  if (!posting) return <GEmptyState icon="briefcase-outline" title="وظيفة غير موجودة" description="تعذّر العثور على بيانات الإعلان الوظيفي" />;

  const ref = posting.ref ?? `#${posting.id}`;
  const st = statusBadge(posting.status ?? '');
  const applicants = posting.applicants ?? (Array.isArray(applicantsData) ? applicantsData : []);
  const isExpiring = posting.closingDate && new Date(posting.closingDate) < new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'تفاصيل الوظيفة' },
    { key: 'applicants', label: `المتقدمون (${posting.applicantsCount ?? applicants.length})` },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: posting.jobTitle ?? 'إعلان وظيفي' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{posting.jobTitle ?? '—'}</Text>
          {posting.department ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{posting.department}</Text> : null}
          {posting.employmentType ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{posting.employmentType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.onPrimary }}>{posting.applicantsCount ?? applicants.length}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>متقدم</Text>
        </View>
      </View>

      {isExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>الإعلان يغلق قريبًا: {fmtDate(posting.closingDate)}</Text>
        </View>
      )}

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
                { label: 'الفرع', value: posting.branch },
                { label: 'الوظائف المتاحة', value: posting.openPositions ? `${posting.openPositions} وظيفة` : undefined },
                { label: 'الراتب', value: posting.salary },
                { label: 'تاريخ النشر', value: posting.publishedDate ? fmtDate(posting.publishedDate) : undefined },
                { label: 'تاريخ الإغلاق', value: posting.closingDate ? fmtDate(posting.closingDate) : undefined },
                { label: 'مدير الموارد البشرية', value: posting.hrManager },
                { label: 'المختصرون', value: posting.shortlistedCount ? `${posting.shortlistedCount} مرشح` : undefined },
              ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
                </View>
              ))}
            </GCard>

            {posting.description ? (
              <GCard>
                <GText variant="caption" color="muted">الوصف الوظيفي</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{posting.description}</Text>
              </GCard>
            ) : null}

            {posting.requirements ? (
              <GCard>
                <GText variant="caption" color="muted">المتطلبات</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{posting.requirements}</Text>
              </GCard>
            ) : null}
          </>
        )}

        {tab === 'applicants' && (
          applicants.length === 0
            ? <GEmptyState icon="people-outline" title="لا يوجد متقدمون" description="لم يتقدم أحد لهذه الوظيفة حتى الآن" />
            : applicants.map((ap, i) => {
              const as = statusBadge(ap.status ?? '');
              return (
                <GCard key={ap.id ?? i} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {as ? <GStatusBadge status={as.label} size="sm" /> : null}
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {ap.score !== undefined ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{ap.score}%</Text> : null}
                      <Text style={{ fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'right' }}>{ap.name ?? '—'}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{fmtDate(ap.appliedAt)}</Text>
                </GCard>
              );
            })
        )}

        <GButton title="طلب توظيف جديد" icon="person-add-outline" variant="secondary" onPress={() => router.push('/hr/recruitment-new' as never)} />
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
