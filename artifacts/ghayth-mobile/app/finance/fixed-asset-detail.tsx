/**
 * تفاصيل الأصل الثابت
 * GET /api/finance/fixed-assets/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface FixedAsset {
  id: number;
  ref?: string;
  name?: string;
  assetNumber?: string;
  category?: string;
  subCategory?: string;
  status?: string;
  location?: string;
  department?: string;
  responsibleEmployee?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  currentValue?: number;
  salvageValue?: number;
  currency?: string;
  depreciationMethod?: string;
  usefulLife?: number;
  usefulLifeUnit?: string;
  accumulatedDepreciation?: number;
  depreciationRate?: number;
  supplier?: string;
  warrantyExpiry?: string;
  serialNumber?: string;
  notes?: string;
  schedule?: DepreciationEntry[];
}

interface DepreciationEntry {
  period?: string;
  amount?: number;
  accumulated?: number;
  bookValue?: number;
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

export default function FixedAssetDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: asset, isLoading } = useList<FixedAsset>(`/api/finance/fixed-assets/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الأصل…" />;
  if (!asset) return <GEmptyState icon="cube-outline" title="أصل غير موجود" description="تعذّر العثور على بيانات الأصل الثابت" />;

  const ref = asset.ref ?? asset.assetNumber ?? `#${asset.id}`;
  const st = statusBadge(asset.status ?? '');
  const currency = asset.currency;
  const depPct = asset.purchaseCost && asset.accumulatedDepreciation
    ? Math.round((asset.accumulatedDepreciation / asset.purchaseCost) * 100)
    : 0;
  const warrantyExpiring = asset.warrantyExpiry && new Date(asset.warrantyExpiry) < new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const schedule = asset.schedule ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: asset.name ?? 'الأصل الثابت' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{asset.name ?? '—'}</Text>
          {asset.category ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{asset.category}</Text> : null}
          {asset.assetNumber ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>#{asset.assetNumber}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.onPrimary }}>{fmtMoney(asset.currentValue, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>القيمة الدفترية</Text>
        </View>
      </View>

      {/* شريط الاستهلاك */}
      {asset.purchaseCost ? (
        <View>
          <View style={{ height: 6, backgroundColor: c.border }}>
            <View style={{ height: 6, width: `${depPct}%`, backgroundColor: '#EF4444' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>مُستهلَك {depPct}%</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>تكلفة الشراء: {fmtMoney(asset.purchaseCost, currency)}</Text>
          </View>
        </View>
      ) : null}

      {warrantyExpiring && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>ضمان ينتهي قريبًا: {fmtDate(asset.warrantyExpiry)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {/* مالي */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تكلفة الشراء', value: fmtMoney(asset.purchaseCost, currency) },
            { label: 'الاستهلاك المتراكم', value: asset.accumulatedDepreciation !== undefined ? fmtMoney(asset.accumulatedDepreciation, currency) : undefined },
            { label: 'القيمة الدفترية', value: fmtMoney(asset.currentValue, currency) },
            { label: 'القيمة التخريدية', value: fmtMoney(asset.salvageValue, currency) },
            { label: 'طريقة الاستهلاك', value: asset.depreciationMethod },
            { label: 'العمر الإنتاجي', value: asset.usefulLife ? `${asset.usefulLife} ${asset.usefulLifeUnit ?? 'سنة'}` : undefined },
            { label: 'معدل الاستهلاك', value: asset.depreciationRate !== undefined ? `${asset.depreciationRate}%` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* تفاصيل */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'القسم', value: asset.department },
            { label: 'الموقع', value: asset.location },
            { label: 'الموظف المسؤول', value: asset.responsibleEmployee },
            { label: 'المورد', value: asset.supplier },
            { label: 'الرقم التسلسلي', value: asset.serialNumber },
            { label: 'تاريخ الشراء', value: asset.purchaseDate ? fmtDate(asset.purchaseDate) : undefined },
            { label: 'انتهاء الضمان', value: asset.warrantyExpiry ? fmtDate(asset.warrantyExpiry) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {schedule.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">جدول الاستهلاك</GText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted }}>القيمة الدفترية</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted }}>قسط الاستهلاك</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted }}>الفترة</Text>
            </View>
            {schedule.slice(0, 12).map((entry, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: i < schedule.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtMoney(entry.bookValue, currency)}</Text>
                <Text style={{ fontSize: 12, color: '#EF4444' }}>{fmtMoney(entry.amount, currency)}</Text>
                <Text style={{ fontSize: 12, color: c.text }}>{entry.period ?? '—'}</Text>
              </View>
            ))}
            {schedule.length > 12 ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', paddingTop: 8 }}>+{schedule.length - 12} فترة أخرى</Text> : null}
          </GCard>
        )}

        {asset.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{asset.notes}</Text>
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
