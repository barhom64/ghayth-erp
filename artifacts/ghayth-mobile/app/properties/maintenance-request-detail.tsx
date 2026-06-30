/**
 * تفاصيل طلب الصيانة
 * GET /api/properties/maintenance-requests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';
import { useQueryClient } from '@tanstack/react-query';

interface MaintenanceRequest {
  id: number;
  ref?: string;
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  status?: string;
  propertyName?: string;
  unitNumber?: string;
  tenantName?: string;
  tenantPhone?: string;
  assignedTo?: string;
  reportedAt?: string;
  scheduledDate?: string;
  completedAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  currency?: string;
  notes?: string;
  attachments?: { id: number; name?: string }[];
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

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22C55E', medium: '#F59E0B', high: '#EF4444', urgent: '#7C3AED',
};

export default function MaintenanceRequestDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: req, isLoading } = useList<MaintenanceRequest>(`/api/properties/maintenance-requests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلب الصيانة…" />;
  if (!req) return <GEmptyState icon="construct-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات الطلب" />;

  const ref = req.ref ?? `#${req.id}`;
  const st = statusBadge(req.status ?? '');
  const priorityColor = PRIORITY_COLORS[(req.priority ?? '').toLowerCase()] ?? c.brand;
  const attachments = req.attachments ?? [];
  const canComplete = req.status !== 'completed' && req.status !== 'مكتمل';

  async function complete() {
    await apiFetch(`/api/properties/maintenance-requests/${id}/complete`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/properties/maintenance-requests/${id}`] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `طلب صيانة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{req.title ?? '—'}</Text>
          {req.propertyName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{req.propertyName}{req.unitNumber ? ` — وحدة ${req.unitNumber}` : ''}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {req.priority ? (
              <View style={{ backgroundColor: priorityColor + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: priorityColor, fontWeight: '700' }}>{req.priority}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="construct-outline" size={40} color={c.onPrimary + '80'} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المستأجر', value: req.tenantName },
            { label: 'هاتف المستأجر', value: req.tenantPhone },
            { label: 'الفئة', value: req.category },
            { label: 'المسند إليه', value: req.assignedTo },
            { label: 'تاريخ البلاغ', value: req.reportedAt ? fmtDate(req.reportedAt) : undefined },
            { label: 'الموعد المجدول', value: req.scheduledDate ? fmtDate(req.scheduledDate) : undefined },
            { label: 'تاريخ الإكمال', value: req.completedAt ? fmtDate(req.completedAt) : undefined },
            { label: 'التكلفة التقديرية', value: req.estimatedCost !== undefined ? fmtMoney(req.estimatedCost, req.currency) : undefined },
            { label: 'التكلفة الفعلية', value: req.actualCost !== undefined ? fmtMoney(req.actualCost, req.currency) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {req.description ? (
          <GCard>
            <GText variant="caption" color="muted">وصف المشكلة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{req.description}</Text>
          </GCard>
        ) : null}

        {req.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{req.notes}</Text>
          </GCard>
        ) : null}

        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المرفقات</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="image-outline" size={16} color={c.brand} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مرفق ${att.id}`}</Text>
              </View>
            ))}
          </GCard>
        )}

        {canComplete && (
          <View
            style={{ backgroundColor: '#22C55E', borderRadius: 12, padding: 16, alignItems: 'center' }}
            // @ts-ignore
            onStartShouldSetResponder={() => true}
            onResponderRelease={complete}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>تحديد كمكتمل</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
