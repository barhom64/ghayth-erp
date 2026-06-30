/**
 * تفاصيل طلب الصيانة للأسطول
 * GET /api/fleet/maintenance/:id
 * POST /api/fleet/maintenance/:id/approve
 * POST /api/fleet/maintenance/:id/complete
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface MaintenanceOrder {
  id: number;
  ref?: string;
  orderNumber?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  driverName?: string;
  maintenanceType?: string;
  description?: string;
  scheduledDate?: string;
  completedDate?: string;
  status?: string;
  priority?: string;
  estimatedCost?: number;
  actualCost?: number;
  currency?: string;
  workshop?: string;
  technicianName?: string;
  odometer?: number;
  nextMaintenanceOdometer?: number;
  nextMaintenanceDate?: string;
  notes?: string;
  parts?: MaintenancePart[];
}

interface MaintenancePart {
  id?: number;
  name?: string;
  quantity?: number;
  unitCost?: number;
  total?: number;
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

export default function MaintenanceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: order, isLoading, refetch } = useList<MaintenanceOrder>(`/api/fleet/maintenance/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/fleet/maintenance/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل أمر الصيانة…" />;
  if (!order) return <GEmptyState icon="build-outline" title="أمر صيانة غير موجود" description="تعذّر العثور على بيانات أمر الصيانة" />;

  const ref = order.orderNumber ?? order.ref ?? `#${order.id}`;
  const st = statusBadge(order.status ?? '');
  const currency = order.currency;
  const parts = order.parts ?? [];
  const isPending = order.status === 'pending' || order.status === 'draft';
  const isApproved = order.status === 'approved' || order.status === 'in_progress';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `صيانة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{order.vehiclePlate ?? '—'} — {order.vehicleModel ?? ''}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 2 }}>{order.maintenanceType ?? '—'}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(order.actualCost ?? order.estimatedCost, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>{order.actualCost ? 'التكلفة الفعلية' : 'التكلفة التقديرية'}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'السائق', value: order.driverName },
            { label: 'ورشة الصيانة', value: order.workshop },
            { label: 'الفني المختص', value: order.technicianName },
            { label: 'تاريخ الصيانة', value: fmtDate(order.scheduledDate) },
            { label: 'تاريخ الإتمام', value: order.completedDate ? fmtDate(order.completedDate) : undefined },
            { label: 'قراءة العداد', value: order.odometer ? `${order.odometer.toLocaleString('ar-SA')} كم` : undefined },
            { label: 'الصيانة التالية', value: order.nextMaintenanceOdometer ? `${order.nextMaintenanceOdometer.toLocaleString('ar-SA')} كم` : undefined },
            { label: 'تاريخ الصيانة التالية', value: order.nextMaintenanceDate ? fmtDate(order.nextMaintenanceDate) : undefined },
            { label: 'التكلفة التقديرية', value: fmtMoney(order.estimatedCost, currency) },
            { label: 'التكلفة الفعلية', value: order.actualCost ? fmtMoney(order.actualCost, currency) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {order.description ? (
          <GCard>
            <GText variant="caption" color="muted">وصف العمل</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{order.description}</Text>
          </GCard>
        ) : null}

        {/* قطع الغيار */}
        {parts.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>قطع الغيار</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>القطعة</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 40, textAlign: 'center' }}>كمية</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>الإجمالي</Text>
              </View>
              {parts.map((part, i) => (
                <View key={part.id ?? i} style={[styles.lineRow, { borderBottomColor: c.border }, i === parts.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1, textAlign: 'right' }}>{part.name ?? '—'}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, width: 40, textAlign: 'center' }}>{part.quantity ?? 1}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 80, textAlign: 'left' }}>{fmtMoney(part.total, currency)}</Text>
                </View>
              ))}
            </GCard>
          </>
        )}

        {order.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{order.notes}</Text>
          </GCard>
        ) : null}

        {isPending && (
          <GButton title="اعتماد أمر الصيانة" onPress={() => doAction('approve', 'اعتماد أمر الصيانة')} loading={acting} />
        )}
        {isApproved && (
          <GButton title="تأكيد إتمام الصيانة" variant="secondary" onPress={() => doAction('complete', 'تأكيد إتمام الصيانة')} loading={acting} />
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
