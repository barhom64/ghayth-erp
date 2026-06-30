/**
 * تفاصيل وثيقة التأمين
 * GET /api/fleet/insurance/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetInsurance {
  id: number;
  ref?: string;
  policyNumber?: string;
  provider?: string;
  vehiclePlate?: string;
  vehicleId?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  premium?: number;
  coverageAmount?: number;
  currency?: string;
  status?: string;
  notes?: string;
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

export default function FleetInsuranceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: ins, isLoading } = useList<FleetInsurance>(`/api/fleet/insurance/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل وثيقة التأمين…" />;
  if (!ins) return <GEmptyState icon="shield-checkmark-outline" title="وثيقة غير موجودة" description="تعذّر العثور على وثيقة التأمين" />;

  const expiry = ins.endDate ? new Date(ins.endDate) : null;
  const now = new Date();
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : null;
  const expiring = daysLeft !== null && daysLeft <= 30;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: ins.policyNumber ?? 'وثيقة التأمين' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{ins.provider ?? '—'}</Text>
          {ins.vehiclePlate ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{ins.vehiclePlate}</Text> : null}
          {ins.type ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{ins.type}</Text> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(ins.premium, ins.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>القسط</Text>
        </View>
      </View>

      {(expiring || expired) && (
        <View style={{ backgroundColor: expired ? '#FEF2F2' : '#FFFBEB', borderBottomColor: expired ? '#FCA5A5' : '#FCD34D', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color={expired ? '#EF4444' : '#F59E0B'} />
          <Text style={{ fontSize: 13, color: expired ? '#EF4444' : '#B45309', fontWeight: '600' }}>
            {expired ? `انتهت الوثيقة بتاريخ ${fmtDate(ins.endDate)}` : `تنتهي الوثيقة خلال ${daysLeft} يوم`}
          </Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {ins.coverageAmount !== undefined && (
          <GCard style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#7C3AED' }}>{fmtMoney(ins.coverageAmount, ins.currency)}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>مبلغ التغطية</Text>
          </GCard>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم الوثيقة', value: ins.policyNumber },
            { label: 'شركة التأمين', value: ins.provider },
            { label: 'نوع التأمين', value: ins.type },
            { label: 'تاريخ البداية', value: ins.startDate ? fmtDate(ins.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: ins.endDate ? fmtDate(ins.endDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {ins.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{ins.notes}</Text>
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
