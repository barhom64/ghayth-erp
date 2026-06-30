/**
 * تفاصيل فحص المركبة
 * GET /api/fleet/inspections/:id
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface FleetInspection {
  id: number;
  ref?: string;
  vehicleName?: string;
  vehiclePlate?: string;
  driverName?: string;
  inspectionType?: string;
  status?: string;
  inspectionDate?: string;
  mileage?: number;
  overallCondition?: string;
  notes?: string;
  photosCount?: number;
  checkItems?: { label: string; passed?: boolean; notes?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const TYPE_LABELS: Record<string, string> = {
  pre_trip: 'فحص قبل الرحلة',
  post_trip: 'فحص بعد الرحلة',
  daily: 'فحص يومي',
  emergency: 'فحص طارئ',
};

export default function FleetInspectionDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: inspection, isLoading } = useList<FleetInspection>(`/api/fleet/inspections/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الفحص…" />;
  if (!inspection) return <GEmptyState icon="car-outline" title="فحص غير موجود" description="تعذّر العثور على بيانات الفحص" />;

  const st = statusBadge(inspection.status ?? '');
  const checks = inspection.checkItems ?? [];
  const passed = checks.filter(c => c.passed).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `فحص ${inspection.vehiclePlate ?? inspection.ref ?? ''}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#0EA5E9' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{inspection.vehiclePlate ?? inspection.vehicleName ?? '—'}</Text>
          {inspection.vehicleName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{inspection.vehicleName}</Text> : null}
          <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{TYPE_LABELS[inspection.inspectionType ?? ''] ?? inspection.inspectionType ?? '—'}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {checks.length > 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF' }}>{passed}/{checks.length}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>سليم</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'السائق', value: inspection.driverName },
            { label: 'تاريخ الفحص', value: fmtDate(inspection.inspectionDate) },
            { label: 'عداد المسافة', value: inspection.mileage !== undefined ? `${inspection.mileage.toLocaleString('ar-SA')} كم` : undefined },
            { label: 'الحالة العامة', value: inspection.overallCondition },
            { label: 'الصور', value: inspection.photosCount !== undefined ? `${inspection.photosCount} صورة` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.row, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, flex: 1, textAlign: 'right' }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {inspection.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{inspection.notes}</Text>
          </GCard>
        ) : null}

        {checks.length > 0 && (
          <GCard style={{ gap: 6 }}>
            <GText variant="caption" color="muted">بنود الفحص</GText>
            {checks.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 16 }}>{item.passed ? '✅' : '❌'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{item.label}</Text>
                  {item.notes ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{item.notes}</Text> : null}
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
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
