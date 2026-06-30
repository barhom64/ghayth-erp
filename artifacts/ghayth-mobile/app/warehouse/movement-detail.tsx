/**
 * تفاصيل حركة المخزون
 * GET /api/warehouse/movements/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StockMovement {
  id: number;
  ref?: string;
  movementNumber?: string;
  type?: string;
  productName?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  currency?: string;
  fromWarehouse?: string;
  toWarehouse?: string;
  reference?: string;
  date?: string;
  createdAt?: string;
  notes?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  in: { label: 'إدخال', color: '#22C55E', icon: 'arrow-down-circle-outline' },
  out: { label: 'إخراج', color: '#EF4444', icon: 'arrow-up-circle-outline' },
  return: { label: 'مرتجع', color: '#F59E0B', icon: 'refresh-circle-outline' },
  transfer_in: { label: 'تحويل وارد', color: '#3B82F6', icon: 'swap-horizontal-outline' },
  transfer_out: { label: 'تحويل صادر', color: '#8B5CF6', icon: 'swap-horizontal-outline' },
  adjustment_in: { label: 'تسوية إضافة', color: '#06B6D4', icon: 'add-circle-outline' },
  adjustment_out: { label: 'تسوية خصم', color: '#F97316', icon: 'remove-circle-outline' },
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function StockMovementDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: mov, isLoading } = useList<StockMovement>(`/api/warehouse/movements/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحركة…" />;
  if (!mov) return <GEmptyState icon="swap-horizontal-outline" title="حركة غير موجودة" description="تعذّر العثور على بيانات حركة المخزون" />;

  const ref = mov.ref ?? mov.movementNumber ?? `#${mov.id}`;
  const typeInfo = TYPE_LABELS[mov.type ?? ''] ?? { label: mov.type ?? '', color: c.brand, icon: 'swap-horizontal-outline' };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `حركة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: typeInfo.color }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{mov.productName ?? '—'}</Text>
          <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{typeInfo.label}</Text>
          {mov.reference ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>مرجع: {mov.reference}</Text> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Ionicons name={typeInfo.icon as never} size={28} color="#FFF" />
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{mov.quantity ?? 0}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>{mov.unit ?? 'وحدة'}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(mov.unitCost !== undefined || mov.totalCost !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {mov.unitCost !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: c.brand }}>{fmtMoney(mov.unitCost, mov.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>تكلفة الوحدة</Text>
              </GCard>
            )}
            {mov.totalCost !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: typeInfo.color }}>{fmtMoney(mov.totalCost, mov.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>إجمالي التكلفة</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'التاريخ', value: (mov.date ?? mov.createdAt) ? fmtDate(mov.date ?? mov.createdAt) : undefined },
            { label: 'من مستودع', value: mov.fromWarehouse },
            { label: 'إلى مستودع', value: mov.toWarehouse },
            { label: 'المرجع', value: mov.reference },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {mov.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{mov.notes}</Text>
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
