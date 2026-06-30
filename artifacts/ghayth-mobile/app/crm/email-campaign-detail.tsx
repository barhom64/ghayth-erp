/**
 * تفاصيل حملة البريد الإلكتروني
 * GET /api/marketing/email-campaigns/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface EmailCampaign {
  id: number;
  name?: string;
  subject?: string;
  listName?: string;
  status?: string;
  scheduledAt?: string;
  sentAt?: string;
  totalRecipients?: number;
  sentCount?: number;
  openCount?: number;
  clickCount?: number;
  unsubscribeCount?: number;
  openRate?: number;
  clickRate?: number;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function EmailCampaignDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: camp, isLoading } = useList<EmailCampaign>(`/api/marketing/email-campaigns/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحملة…" />;
  if (!camp) return <GEmptyState icon="mail-outline" title="حملة غير موجودة" description="تعذّر العثور على بيانات حملة البريد الإلكتروني" />;

  const st = statusBadge(camp.status ?? '');
  const openPct = camp.sentCount && camp.openCount ? Math.round((camp.openCount / camp.sentCount) * 100) : (camp.openRate ? Math.round(camp.openRate * 100) : 0);
  const clickPct = camp.sentCount && camp.clickCount ? Math.round((camp.clickCount / camp.sentCount) * 100) : (camp.clickRate ? Math.round(camp.clickRate * 100) : 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: camp.name ?? 'حملة بريد' }} />

      <View style={[styles.header, { backgroundColor: '#DB2777' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{camp.name ?? '—'}</Text>
          {camp.subject ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{camp.subject}</Text> : null}
          {camp.listName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{camp.listName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {camp.totalRecipients !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{camp.totalRecipients.toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مستلم</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0EA5E9' }}>{openPct}%</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>نسبة الفتح</Text>
          </GCard>
          <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981' }}>{clickPct}%</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>نسبة النقر</Text>
          </GCard>
        </View>

        {camp.sentCount !== undefined && (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${openPct}%`, backgroundColor: '#0EA5E9', borderRadius: 3 }} />
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'القائمة البريدية', value: camp.listName },
            { label: 'تاريخ الجدولة', value: camp.scheduledAt ? fmtDate(camp.scheduledAt) : undefined },
            { label: 'تاريخ الإرسال', value: camp.sentAt ? fmtDate(camp.sentAt) : undefined },
            { label: 'الرسائل المُرسَلة', value: camp.sentCount !== undefined ? String(camp.sentCount) : undefined },
            { label: 'رسائل مفتوحة', value: camp.openCount !== undefined ? String(camp.openCount) : undefined },
            { label: 'نقرات', value: camp.clickCount !== undefined ? String(camp.clickCount) : undefined },
            { label: 'إلغاء اشتراك', value: camp.unsubscribeCount !== undefined ? String(camp.unsubscribeCount) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {camp.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{camp.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
