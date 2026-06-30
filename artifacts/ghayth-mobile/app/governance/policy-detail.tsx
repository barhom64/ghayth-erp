/**
 * تفاصيل السياسة / اللائحة التنظيمية
 * GET /api/governance/policies/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Policy {
  id: number;
  ref?: string;
  title?: string;
  category?: string;
  version?: string;
  effectiveDate?: string;
  expiryDate?: string;
  status?: string;
  owner?: string;
  approvedBy?: string;
  approvedAt?: string;
  description?: string;
  scope?: string;
  summary?: string;
  objectives?: string;
  applicableTo?: string;
  reviewCycle?: string;
  nextReviewDate?: string;
  attachments?: { id: number; name?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function PolicyDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: policy, isLoading } = useList<Policy>(`/api/governance/policies/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل السياسة…" />;
  if (!policy) return <GEmptyState icon="shield-checkmark-outline" title="سياسة غير موجودة" description="تعذّر العثور على بيانات السياسة" />;

  const ref = policy.ref ?? `#${policy.id}`;
  const st = statusBadge(policy.status ?? '');
  const attachments = policy.attachments ?? [];
  const isExpiring = policy.expiryDate && new Date(policy.expiryDate) < new Date(Date.now() + 30 * 24 * 3600 * 1000);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: policy.title ?? 'السياسة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{policy.title ?? '—'}</Text>
          {policy.category ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{policy.category}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {policy.version ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: c.onPrimary, fontWeight: '600' }}>الإصدار {policy.version}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="shield-checkmark-outline" size={40} color={c.onPrimary + '80'} />
      </View>

      {/* تحذير انتهاء الصلاحية */}
      {isExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تنتهي صلاحية هذه السياسة قريبًا: {fmtDate(policy.expiryDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {/* بيانات السياسة */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المالك', value: policy.owner },
            { label: 'معتمد من', value: policy.approvedBy },
            { label: 'تاريخ الاعتماد', value: policy.approvedAt ? fmtDate(policy.approvedAt) : undefined },
            { label: 'تاريخ السريان', value: fmtDate(policy.effectiveDate) },
            { label: 'تاريخ الانتهاء', value: policy.expiryDate ? fmtDate(policy.expiryDate) : undefined },
            { label: 'دورة المراجعة', value: policy.reviewCycle },
            { label: 'تاريخ المراجعة القادمة', value: policy.nextReviewDate ? fmtDate(policy.nextReviewDate) : undefined },
            { label: 'نطاق التطبيق', value: policy.applicableTo },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {policy.summary ? (
          <GCard>
            <GText variant="caption" color="muted">ملخص السياسة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{policy.summary}</Text>
          </GCard>
        ) : null}

        {policy.objectives ? (
          <GCard>
            <GText variant="caption" color="muted">الأهداف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{policy.objectives}</Text>
          </GCard>
        ) : null}

        {policy.scope ? (
          <GCard>
            <GText variant="caption" color="muted">النطاق</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{policy.scope}</Text>
          </GCard>
        ) : null}

        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المستندات المرفقة</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="document-text-outline" size={16} color={c.brand} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مستند ${att.id}`}</Text>
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
