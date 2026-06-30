/**
 * تفاصيل الوكيل الفرعي
 * GET /api/umrah/sub-agents/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahSubAgent {
  id: number;
  ref?: string;
  name?: string;
  nuskCode?: string;
  agentName?: string;
  clientName?: string;
  country?: string;
  phone?: string;
  email?: string;
  defaultPricePerMutamer?: number;
  currency?: string;
  totalPilgrims?: number;
  totalBookings?: number;
  balance?: number;
  notes?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function UmrahSubAgentDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: subAgent, isLoading } = useList<UmrahSubAgent>(`/api/umrah/sub-agents/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الوكيل الفرعي…" />;
  if (!subAgent) return <GEmptyState icon="people-circle-outline" title="وكيل غير موجود" description="تعذّر العثور على بيانات الوكيل الفرعي" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: subAgent.name ?? 'الوكيل الفرعي' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#0D9488' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{subAgent.name ?? '—'}</Text>
          {subAgent.nuskCode ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>كود نسك: {subAgent.nuskCode}</Text> : null}
          {subAgent.country ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{subAgent.country}</Text> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{subAgent.totalPilgrims ?? 0}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>معتمر</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(subAgent.totalPilgrims !== undefined || subAgent.totalBookings !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {subAgent.totalPilgrims !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: c.brand }}>{subAgent.totalPilgrims}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>إجمالي المعتمرين</Text>
              </GCard>
            )}
            {subAgent.totalBookings !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#0D9488' }}>{subAgent.totalBookings}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>الحجوزات</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الوكيل الرئيسي', value: subAgent.agentName },
            { label: 'العميل', value: subAgent.clientName },
            { label: 'الهاتف', value: subAgent.phone },
            { label: 'البريد الإلكتروني', value: subAgent.email },
            { label: 'الدولة', value: subAgent.country },
            { label: 'سعر المعتمر الافتراضي', value: subAgent.defaultPricePerMutamer !== undefined ? fmtMoney(subAgent.defaultPricePerMutamer, subAgent.currency) : undefined },
            { label: 'الرصيد', value: subAgent.balance !== undefined ? fmtMoney(subAgent.balance, subAgent.currency) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 160, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {subAgent.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{subAgent.notes}</Text>
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
