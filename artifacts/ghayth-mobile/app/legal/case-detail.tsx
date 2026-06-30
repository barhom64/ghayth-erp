/**
 * تفاصيل القضية القانونية
 * GET /api/legal/cases/:id
 * GET /api/legal/cases/:id/hearings?pageSize=10
 * GET /api/legal/cases/:id/documents?pageSize=10
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'hearings' | 'documents';

interface LegalCase {
  id: number;
  caseNumber?: string;
  title?: string;
  subject?: string;
  type?: string;
  status?: string;
  court?: string;
  judge?: string;
  clientName?: string;
  opponentName?: string;
  lawyerName?: string;
  openedDate?: string;
  nextHearingDate?: string;
  description?: string;
  claimAmount?: number;
}

interface Hearing {
  id: number;
  date?: string;
  hearingDate?: string;
  result?: string;
  notes?: string;
  nextDate?: string;
  status?: string;
}

interface CaseDocument {
  id: number;
  name?: string;
  title?: string;
  type?: string;
  uploadedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function LegalCaseDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: lcase, isLoading: caseLoading } = useList<LegalCase>(`/api/legal/cases/${id}`);
  const { data: hearingsResp, isLoading: hearLoading } = useList<{ data?: Hearing[] }>(
    `/api/legal/cases/${id}/hearings`, { pageSize: 10 }, { enabled: tab === 'hearings' }
  );
  const { data: docsResp, isLoading: docsLoading } = useList<{ data?: CaseDocument[] }>(
    `/api/legal/cases/${id}/documents`, { pageSize: 10 }, { enabled: tab === 'documents' }
  );

  if (caseLoading) return <GLoadingState text="جارٍ تحميل القضية…" />;
  if (!lcase) return <GEmptyState icon="briefcase-outline" title="قضية غير موجودة" description="تعذّر العثور على بيانات القضية" />;

  const title = lcase.caseNumber ? `قضية ${lcase.caseNumber}` : (lcase.title ?? lcase.subject ?? '—');
  const st = statusBadge(lcase.status ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'information-circle-outline' },
    { key: 'hearings', label: 'الجلسات', icon: 'calendar-outline' },
    { key: 'documents', label: 'المستندات', icon: 'document-text-outline' },
  ];

  const hearings = hearingsResp?.data ?? [];
  const documents = docsResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القضية' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{title}</Text>
          {lcase.court ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{lcase.court}</Text> : null}
          {lcase.nextHearingDate ? (
            <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>
              الجلسة القادمة: {fmtDate(lcase.nextHearingDate)}
            </Text>
          ) : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

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
              { label: 'رقم القضية', value: lcase.caseNumber },
              { label: 'نوع القضية', value: lcase.type },
              { label: 'المحكمة', value: lcase.court },
              { label: 'القاضي', value: lcase.judge },
              { label: 'العميل/الموكّل', value: lcase.clientName },
              { label: 'الخصم', value: lcase.opponentName },
              { label: 'المحامي', value: lcase.lawyerName },
              { label: 'تاريخ الفتح', value: fmtDate(lcase.openedDate) },
              { label: 'قيمة المطالبة', value: lcase.claimAmount !== undefined ? Number(lcase.claimAmount).toLocaleString('ar-SA') + ' ر.س' : undefined },
              { label: 'الوصف', value: lcase.description },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 100, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'hearings' && (
          <>
          <GButton
            title="إضافة جلسة جديدة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/legal/session-new' as never, params: { caseId: id } })}
            style={{ marginBottom: 8 }}
          />
          {hearLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          hearings.length === 0 ? <GEmptyState icon="calendar-outline" title="لا جلسات" description="لا توجد جلسات مسجّلة لهذه القضية" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {hearings.map((h, i) => {
              const st = statusBadge(h.status ?? '');
              return (
                <View key={h.id} style={[styles.listRow, { borderBottomColor: c.border }, i === hearings.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{fmtDate(h.date ?? h.hearingDate)}</Text>
                    {h.result ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{h.result}</Text> : null}
                    {h.nextDate ? <Text style={{ fontSize: 12, color: '#3B82F6', textAlign: 'right' }}>القادمة: {fmtDate(h.nextDate)}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {tab === 'documents' && (
          docsLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          documents.length === 0 ? <GEmptyState icon="document-text-outline" title="لا مستندات" description="لا توجد مستندات مرفقة لهذه القضية" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {documents.map((doc, i) => (
              <View key={doc.id} style={[styles.listRow, { borderBottomColor: c.border }, i === documents.length - 1 && { borderBottomWidth: 0 }]}>
                <Ionicons name="document-outline" size={20} color={c.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{doc.name ?? doc.title ?? '—'}</Text>
                  {(doc.type ?? doc.uploadedAt) ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{doc.type}{doc.uploadedAt ? ` · ${fmtDate(doc.uploadedAt)}` : ''}</Text> : null}
                </View>
              </View>
            ))}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
