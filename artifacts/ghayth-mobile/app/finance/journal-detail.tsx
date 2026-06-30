/**
 * تفاصيل القيد المحاسبي اليدوي
 * GET /api/finance/journal-manual/:id
 * POST /api/finance/journal-manual/:id/approve
 * POST /api/finance/journal-manual/:id/post
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface JournalEntry {
  id: number;
  ref?: string;
  reference?: string;
  date?: string;
  status?: string;
  description?: string;
  notes?: string;
  createdByName?: string;
  approvedByName?: string;
  approvedAt?: string;
  postedAt?: string;
  currency?: string;
  lines?: JournalLine[];
}

interface JournalLine {
  id?: number;
  accountCode?: string;
  accountName?: string;
  debit?: number;
  credit?: number;
  description?: string;
  costCenter?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null || val === 0) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function JournalDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: entry, isLoading, refetch } = useList<JournalEntry>(`/api/finance/journal-manual/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/finance/journal-manual/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل القيد…" />;
  if (!entry) return <GEmptyState icon="book-outline" title="قيد غير موجود" description="تعذّر العثور على بيانات القيد" />;

  const ref = entry.ref ?? entry.reference ?? `#${entry.id}`;
  const st = statusBadge(entry.status ?? '');
  const currency = entry.currency;
  const lines = entry.lines ?? [];
  const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const isDraft = entry.status === 'draft' || entry.status === 'review';
  const isApproved = entry.status === 'approved';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `قيد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>قيد {ref}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{fmtDate(entry.date)}</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            <View style={{ backgroundColor: isBalanced ? '#22C55E30' : '#EF444430', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, color: isBalanced ? '#22C55E' : '#EF4444', fontWeight: '700' }}>{isBalanced ? 'متوازن' : 'غير متوازن'}</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(totalDebit, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>إجمالي المدين</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* الوصف والمعلومات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'أنشئ من', value: entry.createdByName },
            { label: 'اعتمد من', value: entry.approvedByName },
            { label: 'تاريخ الاعتماد', value: entry.approvedAt ? fmtDate(entry.approvedAt) : undefined },
            { label: 'تاريخ الترحيل', value: entry.postedAt ? fmtDate(entry.postedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {entry.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{entry.description}</Text>
          </GCard>
        ) : null}

        {/* سطور القيد */}
        {lines.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>سطور القيد</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>الحساب</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>مدين</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>دائن</Text>
              </View>
              {lines.map((line, i) => (
                <View key={line.id ?? i} style={[styles.lineRow, { borderBottomColor: c.border }, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{line.accountName ?? line.accountCode ?? '—'}</Text>
                    {line.description ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{line.description}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: (line.debit ?? 0) > 0 ? '700' : '400', color: (line.debit ?? 0) > 0 ? c.text : c.textFaint, width: 80, textAlign: 'left' }}>
                    {(line.debit ?? 0) > 0 ? fmtMoney(line.debit, currency) : '—'}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: (line.credit ?? 0) > 0 ? '700' : '400', color: (line.credit ?? 0) > 0 ? c.text : c.textFaint, width: 80, textAlign: 'left' }}>
                    {(line.credit ?? 0) > 0 ? fmtMoney(line.credit, currency) : '—'}
                  </Text>
                </View>
              ))}
              {/* مجموع */}
              <View style={[styles.lineRow, { backgroundColor: c.surfaceAlt, borderTopColor: c.border, borderTopWidth: 1 }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>المجموع</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 80, textAlign: 'left' }}>{fmtMoney(totalDebit, currency)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 80, textAlign: 'left' }}>{fmtMoney(totalCredit, currency)}</Text>
              </View>
            </GCard>
          </>
        )}

        {entry.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{entry.notes}</Text>
          </GCard>
        ) : null}

        {/* إجراءات */}
        {isDraft && (
          <GButton title="اعتماد القيد" onPress={() => doAction('approve', 'اعتماد القيد')} loading={acting} />
        )}
        {isApproved && (
          <GButton title="ترحيل القيد" variant="secondary" onPress={() => doAction('post', 'ترحيل القيد')} loading={acting} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  lineHeader: { flexDirection: 'row', padding: 8, gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderBottomWidth: 1 },
});
