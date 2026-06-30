/**
 * تفاصيل الخطاب الرسمي
 * GET /api/hr/official-letters/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface OfficialLetter {
  id: number;
  ref?: string;
  subject?: string;
  type?: string;
  employeeName?: string;
  issuedBy?: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
  content?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function OfficialLetterDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: letter, isLoading } = useList<OfficialLetter>(`/api/hr/official-letters/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الخطاب…" />;
  if (!letter) return <GEmptyState icon="document-text-outline" title="خطاب غير موجود" description="تعذّر العثور على بيانات الخطاب الرسمي" />;

  const st = statusBadge(letter.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: letter.subject ?? 'الخطاب الرسمي' }} />

      <View style={[styles.header, { backgroundColor: '#0F766E' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{letter.subject ?? '—'}</Text>
          {letter.employeeName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{letter.employeeName}</Text> : null}
          {letter.type ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{letter.type}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <Ionicons name="document-text-outline" size={36} color="#FFF" />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم المرجع', value: letter.ref },
            { label: 'الموظف', value: letter.employeeName },
            { label: 'صادر من', value: letter.issuedBy },
            { label: 'تاريخ الإصدار', value: letter.issueDate ? fmtDate(letter.issueDate) : undefined },
            { label: 'تاريخ الانتهاء', value: letter.expiryDate ? fmtDate(letter.expiryDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {letter.content ? (
          <GCard>
            <GText variant="caption" color="muted">محتوى الخطاب</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 22 }}>{letter.content}</Text>
          </GCard>
        ) : null}

        {letter.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{letter.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="خطاب رسمي جديد" icon="mail-outline" variant="secondary" onPress={() => router.push('/hr/official-letter-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
