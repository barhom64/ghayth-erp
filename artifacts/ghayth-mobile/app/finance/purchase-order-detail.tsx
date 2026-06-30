/**
 * تفاصيل أمر الشراء — بنود + الموافقة + الاستلام
 * GET /api/finance/purchase-orders/:id
 * POST /api/finance/purchase-orders/:id/approve
 * POST /api/finance/purchase-orders/:id/receive
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PurchaseOrder {
  id: number;
  poNumber?: string;
  number?: string;
  supplierName?: string;
  vendorName?: string;
  status?: string;
  issueDate?: string;
  deliveryDate?: string;
  expectedDate?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  notes?: string;
  currency?: string;
  lines?: POLine[];
  approvedBy?: string;
  approvedAt?: string;
}

interface POLine {
  id?: number;
  productName?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  unit?: string;
  total?: number;
  received?: number;
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

export default function PurchaseOrderDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: po, isLoading, refetch } = useList<PurchaseOrder>(`/api/finance/purchase-orders/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/finance/purchase-orders/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل أمر الشراء…" />;
  if (!po) return <GEmptyState icon="cart-outline" title="أمر شراء غير موجود" description="تعذّر العثور على بيانات أمر الشراء" />;

  const num = po.poNumber ?? po.number ?? `#${po.id}`;
  const st = statusBadge(po.status ?? '');
  const lines = po.lines ?? [];
  const currency = po.currency;

  const isDraft = po.status === 'draft' || po.status === 'pending';
  const isApproved = po.status === 'approved';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `أمر شراء ${num}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>أمر شراء {num}</Text>
          {(po.supplierName ?? po.vendorName) ? <Text style={{ fontSize: 14, color: c.onPrimary + 'CC', textAlign: 'right' }}>{po.supplierName ?? po.vendorName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(po.total, currency)}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* معلومات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الإصدار', value: fmtDate(po.issueDate) },
            { label: 'تاريخ التسليم', value: fmtDate(po.deliveryDate ?? po.expectedDate) },
            { label: 'المجموع الفرعي', value: fmtMoney(po.subtotal, currency) },
            { label: 'ضريبة القيمة المضافة', value: po.vatAmount !== undefined ? fmtMoney(po.vatAmount, currency) : undefined },
            { label: 'الإجمالي', value: fmtMoney(po.total, currency) },
            { label: 'معتمد من', value: po.approvedBy },
            { label: 'تاريخ الاعتماد', value: po.approvedAt ? fmtDate(po.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, fontWeight: row.label === 'الإجمالي' ? '700' : '400', color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* البنود */}
        {lines.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>البنود</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>المنتج</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 50, textAlign: 'center' }}>الكمية</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>الإجمالي</Text>
              </View>
              {lines.map((line, i) => (
                <View key={line.id ?? i} style={[styles.lineRow, { borderBottomColor: c.border }, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{line.productName ?? line.description ?? '—'}</Text>
                    <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>
                      {fmtMoney(line.unitPrice, currency)}{line.unit ? ` / ${line.unit}` : ''}
                      {line.received !== undefined ? ` · مستلم: ${line.received}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: c.textMuted, width: 50, textAlign: 'center' }}>{line.quantity ?? 1}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 80, textAlign: 'left' }}>
                    {fmtMoney(line.total, currency)}
                  </Text>
                </View>
              ))}
            </GCard>
          </>
        )}

        {/* ملاحظات */}
        {po.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{po.notes}</Text>
          </GCard>
        ) : null}

        {/* إجراءات */}
        {isDraft && (
          <GButton title="اعتماد أمر الشراء" onPress={() => doAction('approve', 'اعتماد أمر الشراء')} loading={acting} />
        )}
        {isApproved && (
          <GButton title="تسجيل الاستلام" variant="secondary" onPress={() => doAction('receive', 'تسجيل الاستلام')} loading={acting} />
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
