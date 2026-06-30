/**
 * تفاصيل جرد دوري
 * GET /api/warehouse/cycle-counts/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface CycleCount {
  id: number;
  ref?: string;
  status?: string;
  warehouseName?: string;
  warehouseId?: number;
  scheduledDate?: string;
  startedAt?: string;
  completedAt?: string;
  conductedBy?: string;
  approvedBy?: string;
  totalItems?: number;
  countedItems?: number;
  discrepancyItems?: number;
  notes?: string;
  items?: CycleCountItem[];
}

interface CycleCountItem {
  id?: number;
  productName?: string;
  productCode?: string;
  systemQty?: number;
  countedQty?: number;
  variance?: number;
  unit?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function CycleCountDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: count, isLoading } = useList<CycleCount>(`/api/warehouse/cycle-counts/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الجرد…" />;
  if (!count) return <GEmptyState icon="list-outline" title="جرد غير موجود" description="تعذّر العثور على بيانات الجرد الدوري" />;

  const ref = count.ref ?? `#${count.id}`;
  const st = statusBadge(count.status ?? '');
  const items = count.items ?? [];
  const progress = count.totalItems ? Math.round(((count.countedItems ?? 0) / count.totalItems) * 100) : 0;
  const hasDiscrepancy = (count.discrepancyItems ?? 0) > 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `جرد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: hasDiscrepancy ? '#EF4444' : c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{count.warehouseName ?? 'مستودع'}</Text>
          {count.scheduledDate ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>مجدول: {fmtDate(count.scheduledDate)}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFF' }}>{progress}%</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مكتمل</Text>
        </View>
      </View>

      {/* شريط التقدم */}
      <View style={{ height: 6, backgroundColor: c.border }}>
        <View style={{ height: 6, width: `${progress}%`, backgroundColor: hasDiscrepancy ? '#EF4444' : '#22C55E' }} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* KPIs */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'الإجمالي', value: count.totalItems ?? 0, color: c.text },
            { label: 'تم عده', value: count.countedItems ?? 0, color: '#22C55E' },
            { label: 'فروقات', value: count.discrepancyItems ?? 0, color: hasDiscrepancy ? '#EF4444' : c.textMuted },
          ].map(item => (
            <GCard key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: item.color }}>{item.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{item.label}</Text>
            </GCard>
          ))}
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المنفذ', value: count.conductedBy },
            { label: 'المعتمد', value: count.approvedBy },
            { label: 'بدء العد', value: count.startedAt ? fmtDate(count.startedAt) : undefined },
            { label: 'اكتمل في', value: count.completedAt ? fmtDate(count.completedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 100, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {items.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الأصناف</GText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, width: 60, textAlign: 'center' }}>الفرق</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, width: 60, textAlign: 'center' }}>العدد</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, width: 60, textAlign: 'center' }}>النظام</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, flex: 1, textAlign: 'right' }}>الصنف</Text>
            </View>
            {items.map((item, i) => {
              const variance = item.variance ?? ((item.countedQty ?? 0) - (item.systemQty ?? 0));
              const vColor = variance === 0 ? c.textMuted : variance > 0 ? '#22C55E' : '#EF4444';
              return (
                <View key={item.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: vColor, width: 60, textAlign: 'center' }}>{variance > 0 ? '+' : ''}{variance}</Text>
                  <Text style={{ fontSize: 13, color: c.text, width: 60, textAlign: 'center' }}>{item.countedQty ?? '—'}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, width: 60, textAlign: 'center' }}>{item.systemQty ?? '—'}</Text>
                  <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
                </View>
              );
            })}
          </GCard>
        )}

        {count.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{count.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="جرد دوري جديد" icon="list-outline" variant="secondary" onPress={() => router.push('/warehouse/cycle-count-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
