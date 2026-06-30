/**
 * تفاصيل المنتج / الصنف في المستودع
 * GET /api/warehouse/products/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Product {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  unit?: string;
  status?: string;
  stockQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  costPrice?: number;
  sellPrice?: number;
  currency?: string;
  warehouseName?: string;
  location?: string;
  barcode?: string;
  supplier?: string;
  movements?: StockMovement[];
}

interface StockMovement {
  id?: number;
  type?: string;
  quantity?: number;
  date?: string;
  ref?: string;
  notes?: string;
}

type Tab = 'info' | 'stock' | 'movements';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: 'استلام', out: 'صرف', transfer: 'تحويل', adjustment: 'تعديل', return: 'مرتجع',
};

export default function ProductDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: product, isLoading } = useList<Product>(`/api/warehouse/products/${id}`);
  const { data: movementsData } = useList<StockMovement[]>(`/api/warehouse/movements?productId=${id}`, undefined, { enabled: tab === 'movements' });

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الصنف…" />;
  if (!product) return <GEmptyState icon="cube-outline" title="صنف غير موجود" description="تعذّر العثور على بيانات الصنف" />;

  const st = statusBadge(product.status ?? '');
  const currency = product.currency;
  const movements = product.movements ?? (Array.isArray(movementsData) ? movementsData : []);
  const isLowStock = (product.stockQuantity ?? 0) <= (product.minStock ?? 0) && product.minStock !== undefined;
  const available = product.availableQuantity ?? (product.stockQuantity ?? 0) - (product.reservedQuantity ?? 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'stock', label: 'المخزون' },
    { key: 'movements', label: 'الحركات' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: product.name ?? 'الصنف' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{product.name ?? '—'}</Text>
          {product.code ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>#{product.code}</Text> : null}
          {product.category ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{product.category}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {isLowStock ? (
              <View style={{ backgroundColor: '#EF444440', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>مخزون منخفض</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: isLowStock ? '#FFCCCC' : c.onPrimary }}>{product.stockQuantity ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>{product.unit ?? 'وحدة'}</Text>
        </View>
      </View>

      {/* التبويبات */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'الكود', value: product.code },
              { label: 'الباركود', value: product.barcode },
              { label: 'الفئة', value: product.category },
              { label: 'وحدة القياس', value: product.unit },
              { label: 'المستودع', value: product.warehouseName },
              { label: 'الموقع', value: product.location },
              { label: 'المورد', value: product.supplier },
              { label: 'سعر التكلفة', value: fmtMoney(product.costPrice, currency) },
              { label: 'سعر البيع', value: fmtMoney(product.sellPrice, currency) },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'stock' && (
          <>
            <View style={[styles.stockGrid, { gap: 10 }]}>
              {[
                { label: 'الإجمالي', value: product.stockQuantity ?? 0, color: c.text },
                { label: 'محجوز', value: product.reservedQuantity ?? 0, color: '#F59E0B' },
                { label: 'متاح', value: available, color: available > 0 ? '#22C55E' : '#EF4444' },
                { label: 'حد الطلب', value: product.reorderPoint ?? product.minStock ?? 0, color: c.textMuted },
              ].map(item => (
                <GCard key={item.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: item.color }}>{item.value}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{item.label}</Text>
                </GCard>
              ))}
            </View>
            {isLowStock && (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>
                  المخزون ({product.stockQuantity}) أقل من الحد الأدنى ({product.minStock})
                </Text>
              </View>
            )}
          </>
        )}

        {tab === 'movements' && (
          movements.length === 0
            ? <GEmptyState icon="swap-horizontal-outline" title="لا توجد حركات" description="لم يتم تسجيل أي حركات مخزنية لهذا الصنف" />
            : movements.map((mov, i) => (
              <GCard key={mov.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: mov.type === 'in' || mov.type === 'return' ? '#22C55E' : '#EF4444' }}>
                    {mov.type === 'in' || mov.type === 'return' ? '+' : '-'}{mov.quantity ?? 0}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{MOVEMENT_TYPE_LABEL[mov.type ?? ''] ?? mov.type ?? '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(mov.date)}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{mov.ref ?? '—'}</Text>
                </View>
              </GCard>
            ))
        )}

        {product.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{product.description}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap' },
});
