/**
 * لوحة قيادة المدراء والتنفيذيين — مؤشرات KPI على مستوى الشركة
 * GET /api/exec-dashboard/summary + /api/bi/kpis
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GScreen, GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface ExecData {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  profitMargin?: number;
  totalEmployees?: number;
  presentToday?: number;
  attendanceRate?: number;
  totalClients?: number;
  activeProjects?: number;
  overdueInvoices?: number;
  overdueAmount?: number;
  pendingApprovals?: number;
  warehouseAlerts?: number;
  supportTicketsOpen?: number;
  fleetUtilization?: number;
  period?: string;
}

interface KPI {
  id: number | string;
  name: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  module?: string;
  status?: string;
}

interface KPIResp {
  data?: KPI[];
  kpis?: KPI[];
}

function fmtNum(n?: number, currency?: boolean): string {
  if (n === undefined || n === null) return '—';
  if (currency) return `${n.toLocaleString('ar-SA')} ر.س`;
  return n.toLocaleString('ar-SA');
}

function fmtPct(n?: number): string {
  if (n === undefined || n === null) return '—';
  return `${n.toFixed(1)}%`;
}

interface StatCard {
  label: string;
  value: string;
  icon: IoniconName;
  color: string;
  sub?: string;
}

export default function ExecDashboardScreen() {
  const c = useColors();
  const { data, isLoading } = useList<ExecData>('/api/exec-dashboard/summary');
  const { data: kpiResp } = useList<KPIResp>('/api/bi/kpis', { pageSize: 10 });
  const kpis = kpiResp?.data ?? kpiResp?.kpis ?? [];

  if (isLoading) return <GLoadingState text="جاري تحميل لوحة المدير…" />;

  const d = data ?? {};

  const STATS: StatCard[] = [
    { label: 'الإيرادات', value: fmtNum(d.totalRevenue, true), icon: 'trending-up-outline', color: '#22C55E' },
    { label: 'المصروفات', value: fmtNum(d.totalExpenses, true), icon: 'trending-down-outline', color: '#EF4444' },
    { label: 'صافي الربح', value: fmtNum(d.netProfit, true), icon: 'cash-outline', color: '#3B82F6', sub: d.profitMargin !== undefined ? `هامش: ${fmtPct(d.profitMargin)}` : undefined },
    { label: 'الموظفون', value: fmtNum(d.totalEmployees), icon: 'people-outline', color: '#8B5CF6', sub: d.presentToday !== undefined ? `حاضر اليوم: ${d.presentToday}` : undefined },
    { label: 'معدل الحضور', value: fmtPct(d.attendanceRate), icon: 'finger-print-outline', color: '#10B981' },
    { label: 'إجمالي العملاء', value: fmtNum(d.totalClients), icon: 'briefcase-outline', color: '#F59E0B' },
    { label: 'المشاريع النشطة', value: fmtNum(d.activeProjects), icon: 'construct-outline', color: '#6366F1' },
    { label: 'فواتير متأخرة', value: fmtNum(d.overdueInvoices), icon: 'receipt-outline', color: '#EF4444', sub: d.overdueAmount !== undefined ? fmtNum(d.overdueAmount, true) : undefined },
    { label: 'اعتمادات معلقة', value: fmtNum(d.pendingApprovals), icon: 'checkmark-done-outline', color: '#F59E0B' },
    { label: 'تذاكر الدعم', value: fmtNum(d.supportTicketsOpen), icon: 'help-buoy-outline', color: '#EC4899' },
    { label: 'استخدام الأسطول', value: fmtPct(d.fleetUtilization), icon: 'car-outline', color: '#14B8A6' },
    { label: 'تنبيهات المستودع', value: fmtNum(d.warehouseAlerts), icon: 'cube-outline', color: '#EF4444' },
  ];

  return (
    <GScreen scrollable>
      <Stack.Screen options={{ title: 'لوحة المدير التنفيذي' }} />
      <View style={{ padding: 16, gap: 16 }}>
        {d.period && (
          <GText variant="caption" color="muted" style={{ textAlign: 'center' }}>الفترة: {d.period}</GText>
        )}

        {/* KPI Cards Grid */}
        <View style={styles.grid}>
          {STATS.map(st => (
            <GCard key={st.label} style={[styles.statCard, { flex: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: st.color + '20' }]}>
                <Ionicons name={st.icon} size={20} color={st.color} />
              </View>
              <GText variant="heading" style={{ color: st.color, fontSize: 22, fontWeight: '700' }}>{st.value}</GText>
              <GText variant="caption" color="muted">{st.label}</GText>
              {st.sub && <GText variant="caption" color="muted" style={{ fontSize: 10 }}>{st.sub}</GText>}
            </GCard>
          ))}
        </View>

        {/* BI KPIs */}
        {kpis.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>مؤشرات الأداء الرئيسية</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {kpis.map((kpi, idx) => {
                const pct = kpi.targetValue && kpi.currentValue !== undefined
                  ? Math.min(100, Math.round((kpi.currentValue / kpi.targetValue) * 100))
                  : null;
                const trendIcon: IoniconName = kpi.trend === 'up' ? 'trending-up-outline' : kpi.trend === 'down' ? 'trending-down-outline' : 'remove-outline';
                const trendColor = kpi.trend === 'up' ? '#22C55E' : kpi.trend === 'down' ? '#EF4444' : c.textMuted;
                return (
                  <View
                    key={kpi.id}
                    style={[styles.kpiRow, { borderBottomColor: c.border }, idx === kpis.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <GText variant="body" style={{ fontWeight: '600' }}>{kpi.name}</GText>
                      {kpi.module && <GText variant="caption" color="muted">{kpi.module}</GText>}
                      {pct !== null && (
                        <View style={[styles.progressBg, { backgroundColor: c.surfaceAlt }]}>
                          <View style={[styles.progressFg, { width: `${pct}%` as `${number}%`, backgroundColor: pct >= 100 ? '#22C55E' : '#F59E0B' }]} />
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <GText variant="body" style={{ fontWeight: '700' }}>
                        {kpi.currentValue?.toLocaleString('ar-SA') ?? '—'} {kpi.unit ?? ''}
                      </GText>
                      {kpi.targetValue && <GText variant="caption" color="muted">من {kpi.targetValue.toLocaleString('ar-SA')}</GText>}
                      {kpi.trend && <Ionicons name={trendIcon} size={16} color={trendColor} />}
                    </View>
                  </View>
                );
              })}
            </GCard>
          </>
        )}

        {!data && !isLoading && (
          <GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="تحقق من الصلاحيات أو الاتصال بالشبكة" />
        )}
      </View>
    </GScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { minWidth: '45%', gap: 4, alignItems: 'flex-start' },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  progressBg: { height: 4, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  progressFg: { height: 4, borderRadius: 2 },
});
