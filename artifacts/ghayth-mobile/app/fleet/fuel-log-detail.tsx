/**
 * تفاصيل سجل الوقود
 * GET /api/fleet/fuel-logs/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FuelLog {
  id: number;
  ref?: string;
  vehiclePlate?: string;
  vehicleId?: number;
  driverName?: string;
  driverId?: number;
  date?: string;
  fuelType?: string;
  quantity?: number;
  unit?: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  odometer?: number;
  previousOdometer?: number;
  distanceDriven?: number;
  fuelEfficiency?: number;
  station?: string;
  receiptNumber?: string;
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

export default function FuelLogDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: log, isLoading } = useList<FuelLog>(`/api/fleet/fuel-logs/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل الوقود…" />;
  if (!log) return <GEmptyState icon="speedometer-outline" title="سجل غير موجود" description="تعذّر العثور على بيانات سجل الوقود" />;

  const ref = log.ref ?? `#${log.id}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `وقود ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#F97316' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{log.vehiclePlate ?? '—'}</Text>
          {log.driverName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{log.driverName}</Text> : null}
          {log.fuelType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{log.fuelType}</Text> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>{log.quantity ?? 0}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>{log.unit ?? 'لتر'}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF', marginTop: 4 }}>{fmtMoney(log.totalCost, log.currency)}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* KPIs مسافة واستهلاك */}
        {(log.distanceDriven !== undefined || log.fuelEfficiency !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {log.distanceDriven !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: c.brand }}>{log.distanceDriven}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>كم مقطوعة</Text>
              </GCard>
            )}
            {log.fuelEfficiency !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#22C55E' }}>{log.fuelEfficiency.toFixed(1)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>كم/لتر</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'التاريخ', value: log.date ? fmtDate(log.date) : undefined },
            { label: 'محطة الوقود', value: log.station },
            { label: 'رقم الفاتورة', value: log.receiptNumber },
            { label: 'سعر اللتر', value: log.pricePerUnit !== undefined ? fmtMoney(log.pricePerUnit, log.currency) : undefined },
            { label: 'قراءة العداد', value: log.odometer ? `${log.odometer.toLocaleString('ar-SA')} كم` : undefined },
            { label: 'القراءة السابقة', value: log.previousOdometer ? `${log.previousOdometer.toLocaleString('ar-SA')} كم` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {log.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{log.notes}</Text>
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
