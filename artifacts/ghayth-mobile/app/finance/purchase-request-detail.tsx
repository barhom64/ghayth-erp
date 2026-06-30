/**
 * تفاصيل طلب الشراء
 * GET /api/finance/purchase-requests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';
import { useQueryClient } from '@tanstack/react-query';

interface PurchaseRequest {
  id: number;
  ref?: string;
  title?: string;
  status?: string;
  priority?: string;
  department?: string;
  requestedBy?: string;
  approvedBy?: string;
  requestDate?: string;
  neededBy?: string;
  currency?: string;
  estimatedTotal?: number;
  description?: string;
  justification?: string;
  notes?: string;
  items?: PRItem[];
}

interface PRItem {
  id?: number;
  description?: string;
  quantity?: number;
  unit?: string;
  estimatedPrice?: number;
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

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22C55E', normal: '#3B82F6', high: '#EF4444', urgent: '#7C3AED',
};

export default function PurchaseRequestDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pr, isLoading } = useList<PurchaseRequest>(`/api/finance/purchase-requests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلب الشراء…" />;
  if (!pr) return <GEmptyState icon="cart-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات طلب الشراء" />;

  const ref = pr.ref ?? `#${pr.id}`;
  const st = statusBadge(pr.status ?? '');
  const priorityColor = PRIORITY_COLORS[(pr.priority ?? 'normal').toLowerCase()] ?? c.brand;
  const items = pr.items ?? [];
  const isPending = pr.status === 'pending' || pr.status === 'قيد المراجعة';
  const canApprove = isPending && user?.userRoles?.some(r => ['purchasing_manager', 'finance_manager', 'super_admin'].includes(r.roleKey));

  async function approve() {
    await apiFetch(`/api/finance/purchase-requests/${id}/approve`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/finance/purchase-requests/${id}`] });
  }

  async function reject() {
    await apiFetch(`/api/finance/purchase-requests/${id}/reject`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/finance/purchase-requests/${id}`] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `طلب شراء ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{pr.title ?? '—'}</Text>
          {pr.department ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{pr.department}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {pr.priority ? (
              <View style={{ backgroundColor: priorityColor + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: priorityColor, fontWeight: '700' }}>{pr.priority}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(pr.estimatedTotal, pr.currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>التقدير</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'طالب الشراء', value: pr.requestedBy },
            { label: 'تاريخ الطلب', value: pr.requestDate ? fmtDate(pr.requestDate) : undefined },
            { label: 'مطلوب بتاريخ', value: pr.neededBy ? fmtDate(pr.neededBy) : undefined },
            { label: 'معتمد من', value: pr.approvedBy },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {pr.justification ? (
          <GCard>
            <GText variant="caption" color="muted">مبررات الشراء</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{pr.justification}</Text>
          </GCard>
        ) : null}

        {items.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">البنود المطلوبة</GText>
            {items.map((item, i) => (
              <View key={item.id ?? i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{fmtMoney(item.total, pr.currency)}</Text>
                  <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', flex: 1, marginRight: 8 }}>{item.description ?? '—'}</Text>
                </View>
                <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{item.quantity} {item.unit ?? 'وحدة'} × {fmtMoney(item.estimatedPrice, pr.currency)}</Text>
              </View>
            ))}
          </GCard>
        )}

        {pr.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{pr.notes}</Text>
          </GCard>
        ) : null}

        {canApprove && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View
              style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 12, padding: 14, alignItems: 'center' }}
              // @ts-ignore
              onStartShouldSetResponder={() => true}
              onResponderRelease={reject}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>رفض</Text>
            </View>
            <View
              style={{ flex: 1, backgroundColor: '#22C55E', borderRadius: 12, padding: 14, alignItems: 'center' }}
              // @ts-ignore
              onStartShouldSetResponder={() => true}
              onResponderRelease={approve}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>اعتماد</Text>
            </View>
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
