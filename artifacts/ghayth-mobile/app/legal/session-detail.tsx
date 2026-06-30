/**
 * تفاصيل جلسة التقاضي
 * GET /api/legal/sessions/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface LegalSession {
  id: number;
  ref?: string;
  caseTitle?: string;
  caseNumber?: string;
  court?: string;
  location?: string;
  judge?: string;
  sessionDate?: string;
  sessionTime?: string;
  status?: string;
  outcome?: string;
  nextSessionDate?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function LegalSessionDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: session, isLoading } = useList<LegalSession>(`/api/legal/sessions/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الجلسة…" />;
  if (!session) return <GEmptyState icon="calendar-outline" title="جلسة غير موجودة" description="تعذّر العثور على بيانات الجلسة" />;

  const st = statusBadge(session.status ?? '');
  const sessionDate = session.sessionDate ? new Date(session.sessionDate) : null;
  const upcoming = sessionDate && sessionDate > new Date();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'جلسة تقاضي' }} />

      <View style={[styles.header, { backgroundColor: upcoming ? '#0284C7' : '#6B7280' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{session.caseTitle ?? '—'}</Text>
          {session.caseNumber ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>رقم القضية: {session.caseNumber}</Text> : null}
          {session.court ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{session.court}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Ionicons name="calendar-outline" size={24} color="#FFF" />
          <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'center' }}>{fmtDate(session.sessionDate)}</Text>
          {session.sessionTime ? <Text style={{ fontSize: 12, color: '#FFFFFFAA' }}>{session.sessionTime}</Text> : null}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المحكمة', value: session.court },
            { label: 'الموقع', value: session.location },
            { label: 'القاضي', value: session.judge },
            { label: 'تاريخ الجلسة', value: session.sessionDate ? fmtDate(session.sessionDate) : undefined },
            { label: 'الجلسة القادمة', value: session.nextSessionDate ? fmtDate(session.nextSessionDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {session.outcome ? (
          <GCard>
            <GText variant="caption" color="muted">نتيجة الجلسة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{session.outcome}</Text>
          </GCard>
        ) : null}

        {session.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{session.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="جلسة جديدة" icon="calendar-outline" variant="secondary" onPress={() => router.push('/legal/session-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
