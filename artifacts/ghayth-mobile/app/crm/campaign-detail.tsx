/**
 * تفاصيل الحملة التسويقية
 * GET /api/marketing/campaigns/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Campaign {
  id: number;
  ref?: string;
  name?: string;
  type?: string;
  channel?: string;
  status?: string;
  budget?: number;
  spent?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  leadsCount?: number;
  conversions?: number;
  description?: string;
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

export default function CampaignDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: campaign, isLoading } = useList<Campaign>(`/api/marketing/campaigns/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحملة…" />;
  if (!campaign) return <GEmptyState icon="megaphone-outline" title="حملة غير موجودة" description="تعذّر العثور على بيانات الحملة" />;

  const st = statusBadge(campaign.status ?? '');
  const spentPct = campaign.budget && campaign.spent !== undefined ? Math.min(100, Math.round((campaign.spent / campaign.budget) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: campaign.name ?? 'الحملة' }} />

      <View style={[styles.header, { backgroundColor: '#8B5CF6' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{campaign.name ?? '—'}</Text>
          {campaign.channel ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{campaign.channel}</Text> : null}
          {campaign.type ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{campaign.type}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(campaign.budget, campaign.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الميزانية</Text>
        </View>
      </View>

      {campaign.budget && campaign.spent !== undefined ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>الإنفاق: {fmtMoney(campaign.spent, campaign.currency)}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>{spentPct}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${spentPct}%`, backgroundColor: spentPct >= 90 ? '#EF4444' : '#8B5CF6', borderRadius: 3 }} />
          </View>
        </View>
      ) : null}

      <View style={{ padding: 16, gap: 12 }}>
        {(campaign.leadsCount !== undefined || campaign.conversions !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {campaign.leadsCount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: c.brand }}>{campaign.leadsCount}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>عملاء محتملون</Text>
              </GCard>
            )}
            {campaign.conversions !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#8B5CF6' }}>{campaign.conversions}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>تحويلات</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ البداية', value: campaign.startDate ? fmtDate(campaign.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: campaign.endDate ? fmtDate(campaign.endDate) : undefined },
            { label: 'الجمهور المستهدف', value: campaign.targetAudience },
            { label: 'القناة', value: campaign.channel },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {campaign.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{campaign.description}</Text>
          </GCard>
        ) : null}

        <GButton title="حملة تسويقية جديدة" icon="megaphone-outline" variant="secondary" onPress={() => router.push('/crm/campaign-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
