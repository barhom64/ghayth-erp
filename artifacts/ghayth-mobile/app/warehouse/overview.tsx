/**
 * نظرة عامة على المستودعات — مؤشرات + تنبيهات المخزون
 * GET /api/warehouse/summary
 * GET /api/warehouse/alerts
 * GET /api/warehouse/products?lowStock=true&pageSize=20
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Section = 'summary' | 'alerts' | 'lowstock';

interface WarehouseSummary {
  totalProducts?: number;
  totalValue?: number;
  lowStockItems?: number;
  outOfStockItems?: number;
  totalWarehouses?: number;
  totalMovementsToday?: number;
  pendingOrders?: number;
  expiringItems?: number;
  [key: string]: unknown;
}

interface StockAlert {
  id: number;
  productName?: string;
  name?: string;
  sku?: string;
  currentStock?: number;
  minStock?: number;
  warehouseName?: string;
  type?: string;
  severity?: string;
}

interface LowStockProduct {
  id: number;
  name?: string;
  productName?: string;
  sku?: string;
  currentStock?: number;
  minStock?: number;
  unitName?: string;
  warehouseName?: string;
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  const abs = Math.abs(val);
  return (abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)} م` : abs >= 1_000 ? `${(abs / 1_000).toFixed(0)} ك` : abs.toLocaleString('ar-SA')) + ' ر.س';
}

const SECTIONS: Array<{ key: Section; label: string; icon: IoniconName }> = [
  { key: 'summary', label: 'الملخص', icon: 'grid-outline' },
  { key: 'alerts', label: 'التنبيهات', icon: 'warning-outline' },
  { key: 'lowstock', label: 'مخزون منخفض', icon: 'arrow-down-circle-outline' },
];

export default function WarehouseOverviewScreen() {
  const c = useColors();
  const router = useRouter();
  const [section, setSection] = useState<Section>('summary');

  const { data: summary, isLoading: sumLoading } = useList<WarehouseSummary>('/api/warehouse/summary');
  const { data: alertsResp, isLoading: alertsLoading } = useList<{ data?: StockAlert[] }>(
    '/api/warehouse/alerts', { pageSize: 20 }, { enabled: section === 'alerts' }
  );
  const { data: lowResp, isLoading: lowLoading } = useList<{ data?: LowStockProduct[] }>(
    '/api/warehouse/products', { lowStock: 'true', pageSize: 20 }, { enabled: section === 'lowstock' }
  );

  const isLoading = section === 'summary' ? sumLoading : section === 'alerts' ? alertsLoading : lowLoading;

  const alerts = alertsResp?.data ?? [];
  const lowStock = lowResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المستودعات' }} />

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {SECTIONS.map(s => (
          <Pressable
            key={s.key}
            onPress={() => setSection(s.key)}
            style={[styles.tabItem, section === s.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={s.icon} size={16} color={section === s.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: section === s.key ? c.brand : c.textMuted, marginRight: 4 }}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading && <GLoadingState text="جارٍ التحميل…" />}

      {!isLoading && (
        <View style={{ padding: 16, paddingBottom: 40, gap: 16 }}>

          {/* ─── الملخص ─── */}
          {section === 'summary' && summary && (
            <>
              <View style={styles.kpiGrid}>
                <KPIBox label="إجمالي المنتجات" value={String(summary.totalProducts ?? 0)} color="#3B82F6" icon="cube-outline" c={c} />
                <KPIBox label="قيمة المخزون" value={fmtMoney(summary.totalValue)} color="#22C55E" icon="barcode-outline" c={c} />
                <KPIBox label="مخزون منخفض" value={String(summary.lowStockItems ?? 0)} color="#F59E0B" icon="warning-outline" c={c} />
                <KPIBox label="نفد المخزون" value={String(summary.outOfStockItems ?? 0)} color="#EF4444" icon="close-circle-outline" c={c} />
                <KPIBox label="مستودعات" value={String(summary.totalWarehouses ?? 0)} color="#8B5CF6" icon="business-outline" c={c} />
                <KPIBox label="حركات اليوم" value={String(summary.totalMovementsToday ?? 0)} color="#06B6D4" icon="swap-horizontal-outline" c={c} />
                <KPIBox label="طلبات معلقة" value={String(summary.pendingOrders ?? 0)} color="#F59E0B" icon="time-outline" c={c} />
                <KPIBox label="تنبيهات انتهاء" value={String(summary.expiringItems ?? 0)} color="#EF4444" icon="alert-circle-outline" c={c} />
              </View>

              {/* روابط سريعة */}
              <GText variant="subheading" style={{ fontWeight: '700' }}>التنقل السريع</GText>
              <View style={styles.linkGrid}>
                {[
                  { label: 'المنتجات', icon: 'cube-outline' as IoniconName, route: '/m/store/products' },
                  { label: 'حركة المخزون', icon: 'swap-horizontal-outline' as IoniconName, route: '/m/store/movements' },
                  { label: 'طلبات الشراء', icon: 'cart-outline' as IoniconName, route: '/m/store/purchase-orders' },
                  { label: 'الموردون', icon: 'people-outline' as IoniconName, route: '/m/store/suppliers' },
                  { label: 'جرد المخزون', icon: 'list-outline' as IoniconName, route: '/m/store/inventory' },
                ].map(link => (
                  <Pressable
                    key={link.label}
                    onPress={() => router.push(link.route as never)}
                    style={({ pressed }) => [styles.linkCard, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                  >
                    <Ionicons name={link.icon} size={22} color={c.brand} />
                    <Text style={{ fontSize: 12, color: c.text, textAlign: 'center', marginTop: 6 }}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* ─── التنبيهات ─── */}
          {section === 'alerts' && (
            alerts.length === 0 ? <GEmptyState icon="checkmark-circle-outline" title="لا تنبيهات" description="المخزون في حالة جيدة" /> :
            <GCard style={{ gap: 0, padding: 0 }}>
              {alerts.map((alert, i) => {
                const sevColor = alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : c.textMuted;
                return (
                  <View key={alert.id} style={[styles.alertRow, { borderBottomColor: c.border }, i === alerts.length - 1 && { borderBottomWidth: 0 }]}>
                    <Ionicons name="warning-outline" size={20} color={sevColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{alert.productName ?? alert.name ?? '—'}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                        {alert.sku ? `SKU: ${alert.sku} · ` : ''}{alert.warehouseName ?? ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: sevColor, textAlign: 'right' }}>
                        الحالي: {alert.currentStock ?? 0} · الحد الأدنى: {alert.minStock ?? 0}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </GCard>
          )}

          {/* ─── مخزون منخفض ─── */}
          {section === 'lowstock' && (
            lowStock.length === 0 ? <GEmptyState icon="cube-outline" title="لا منتجات" description="لا توجد منتجات بمخزون منخفض" /> :
            <GCard style={{ gap: 0, padding: 0 }}>
              {lowStock.map((p, i) => (
                <View key={p.id} style={[styles.alertRow, { borderBottomColor: c.border }, i === lowStock.length - 1 && { borderBottomWidth: 0 }]}>
                  <Ionicons name="arrow-down-circle-outline" size={20} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{p.name ?? p.productName ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {p.sku ? `${p.sku} · ` : ''}{p.warehouseName ?? ''}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '700', textAlign: 'right' }}>
                      {p.currentStock ?? 0} {p.unitName ?? ''} / حد أدنى {p.minStock ?? 0}
                    </Text>
                  </View>
                </View>
              ))}
            </GCard>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function KPIBox({ label, value, color, icon, c }: { label: string; value: string; color: string; icon: IoniconName; c: ReturnType<typeof useColors> }) {
  return (
    <GCard style={{ flex: 1, minWidth: '45%', alignItems: 'center', paddingVertical: 14, gap: 6 }}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ fontSize: 16, fontWeight: '800', color, textAlign: 'center' }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{label}</Text>
    </GCard>
  );
}

const styles = StyleSheet.create({
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkCard: { width: '30%', borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', minHeight: 70 },
  alertRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 12, gap: 10, borderBottomWidth: 1 },
});
