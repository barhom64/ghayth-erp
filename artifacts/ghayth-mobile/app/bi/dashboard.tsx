/**
 * لوحة ذكاء الأعمال — KPIs ومؤشرات متقدمة
 * GET /api/bi/kpis
 * GET /api/bi/operations
 * GET /api/bi/hr-summary
 * GET /api/bi/finance-summary
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type DashSection = 'overview' | 'hr' | 'finance' | 'ops';

interface KpiData {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  grossProfit?: number;
  totalEmployees?: number;
  presentToday?: number;
  activeProjects?: number;
  openTickets?: number;
  pendingInvoices?: number;
  cashFlow?: number;
  newClients?: number;
  satisfactionScore?: number;
  [key: string]: unknown;
}

interface HrSummary {
  totalEmployees?: number;
  presentToday?: number;
  attendanceRate?: number;
  pendingLeaves?: number;
  pendingLoans?: number;
  pendingOvertimes?: number;
  newHires?: number;
  resignations?: number;
  averageSalary?: number;
  [key: string]: unknown;
}

interface FinanceSummary {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  accountsReceivable?: number;
  accountsPayable?: number;
  cashAndBank?: number;
  pendingInvoices?: number;
  overdueInvoices?: number;
  unpostedJournals?: number;
  [key: string]: unknown;
}

interface OpsSummary {
  activeProjects?: number;
  completedProjectsThisMonth?: number;
  openTickets?: number;
  resolvedTickets?: number;
  slaBreaches?: number;
  activeVehicles?: number;
  pendingMaintenances?: number;
  warehouseAlerts?: number;
  [key: string]: unknown;
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  const abs = Math.abs(val);
  const f = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)} م` :
            abs >= 1_000 ? `${(abs / 1_000).toFixed(0)} ك` :
            abs.toLocaleString('ar-SA');
  return (val < 0 ? '(' : '') + f + (val < 0 ? ')' : '') + ' ر.س';
}

function fmtPct(val?: number): string {
  if (val === undefined || val === null) return '—';
  return `${val.toFixed(1)}%`;
}

const SECTIONS: Array<{ key: DashSection; label: string; icon: IoniconName }> = [
  { key: 'overview', label: 'شامل', icon: 'grid-outline' },
  { key: 'hr', label: 'الموارد البشرية', icon: 'people-outline' },
  { key: 'finance', label: 'المالية', icon: 'cash-outline' },
  { key: 'ops', label: 'العمليات', icon: 'settings-outline' },
];

export default function BiDashboardScreen() {
  const c = useColors();
  const [section, setSection] = useState<DashSection>('overview');

  const { data: kpis, isLoading: kpisLoading } = useList<KpiData>('/api/bi/kpis');
  const { data: hr, isLoading: hrLoading } = useList<HrSummary>('/api/bi/hr-summary', undefined, { enabled: section === 'hr' });
  const { data: finance, isLoading: finLoading } = useList<FinanceSummary>('/api/bi/finance-summary', undefined, { enabled: section === 'finance' });
  const { data: ops, isLoading: opsLoading } = useList<OpsSummary>('/api/bi/operations', undefined, { enabled: section === 'ops' });

  const isLoading = section === 'overview' ? kpisLoading :
                    section === 'hr' ? hrLoading :
                    section === 'finance' ? finLoading : opsLoading;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ذكاء الأعمال' }} />

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

      {isLoading && <GLoadingState text="جارٍ تحميل المؤشرات…" />}

      {!isLoading && (
        <View style={{ padding: 16, paddingBottom: 40, gap: 16 }}>

          {/* ─── شامل ─── */}
          {section === 'overview' && kpis && (
            <>
              <GText variant="subheading" style={{ fontWeight: '700' }}>المؤشرات الرئيسية</GText>
              <View style={styles.kpiGrid}>
                <KPICard label="إجمالي الإيرادات" value={fmtMoney(kpis.totalRevenue)} color="#22C55E" icon="trending-up-outline" c={c} />
                <KPICard label="صافي الربح" value={fmtMoney(kpis.netProfit)} color={(kpis.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444'} icon="barcode-outline" c={c} />
                <KPICard label="المصروفات" value={fmtMoney(kpis.totalExpenses)} color="#EF4444" icon="trending-down-outline" c={c} />
                <KPICard label="الموظفون" value={String(kpis.totalEmployees ?? 0)} color="#3B82F6" icon="people-outline" c={c} />
                <KPICard label="حاضر اليوم" value={String(kpis.presentToday ?? 0)} color="#22C55E" icon="finger-print-outline" c={c} />
                <KPICard label="مشاريع نشطة" value={String(kpis.activeProjects ?? 0)} color="#8B5CF6" icon="briefcase-outline" c={c} />
                <KPICard label="تذاكر مفتوحة" value={String(kpis.openTickets ?? 0)} color="#F59E0B" icon="help-buoy-outline" c={c} />
                <KPICard label="عملاء جدد" value={String(kpis.newClients ?? 0)} color="#06B6D4" icon="person-add-outline" c={c} />
              </View>
            </>
          )}

          {/* ─── موارد بشرية ─── */}
          {section === 'hr' && hr && (
            <>
              <GText variant="subheading" style={{ fontWeight: '700' }}>الموارد البشرية</GText>
              <View style={styles.kpiGrid}>
                <KPICard label="إجمالي الموظفين" value={String(hr.totalEmployees ?? 0)} color="#3B82F6" icon="people-outline" c={c} />
                <KPICard label="نسبة الحضور" value={fmtPct(hr.attendanceRate)} color="#22C55E" icon="trending-up-outline" c={c} />
                <KPICard label="حاضر اليوم" value={String(hr.presentToday ?? 0)} color="#22C55E" icon="finger-print-outline" c={c} />
                <KPICard label="إجازات معلقة" value={String(hr.pendingLeaves ?? 0)} color="#F59E0B" icon="calendar-outline" c={c} />
                <KPICard label="سلف معلقة" value={String(hr.pendingLoans ?? 0)} color="#EF4444" icon="card-outline" c={c} />
                <KPICard label="وقت إضافي معلق" value={String(hr.pendingOvertimes ?? 0)} color="#8B5CF6" icon="time-outline" c={c} />
                <KPICard label="موظفون جدد" value={String(hr.newHires ?? 0)} color="#22C55E" icon="person-add-outline" c={c} />
                <KPICard label="متوسط الراتب" value={fmtMoney(hr.averageSalary)} color="#3B82F6" icon="barcode-outline" c={c} />
              </View>
            </>
          )}

          {/* ─── مالية ─── */}
          {section === 'finance' && finance && (
            <>
              <GText variant="subheading" style={{ fontWeight: '700' }}>المالية</GText>
              <View style={styles.kpiGrid}>
                <KPICard label="الإيرادات" value={fmtMoney(finance.totalRevenue)} color="#22C55E" icon="trending-up-outline" c={c} />
                <KPICard label="المصروفات" value={fmtMoney(finance.totalExpenses)} color="#EF4444" icon="trending-down-outline" c={c} />
                <KPICard label="صافي الربح" value={fmtMoney(finance.netProfit)} color={(finance.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444'} icon="barcode-outline" c={c} />
                <KPICard label="ذمم مدينة" value={fmtMoney(finance.accountsReceivable)} color="#3B82F6" icon="receipt-outline" c={c} />
                <KPICard label="ذمم دائنة" value={fmtMoney(finance.accountsPayable)} color="#F59E0B" icon="card-outline" c={c} />
                <KPICard label="النقد والبنوك" value={fmtMoney(finance.cashAndBank)} color="#22C55E" icon="wallet-outline" c={c} />
                <KPICard label="فواتير معلقة" value={String(finance.pendingInvoices ?? 0)} color="#F59E0B" icon="time-outline" c={c} />
                <KPICard label="فواتير متأخرة" value={String(finance.overdueInvoices ?? 0)} color="#EF4444" icon="alert-circle-outline" c={c} />
              </View>
            </>
          )}

          {/* ─── عمليات ─── */}
          {section === 'ops' && ops && (
            <>
              <GText variant="subheading" style={{ fontWeight: '700' }}>العمليات</GText>
              <View style={styles.kpiGrid}>
                <KPICard label="مشاريع نشطة" value={String(ops.activeProjects ?? 0)} color="#8B5CF6" icon="briefcase-outline" c={c} />
                <KPICard label="مكتملة هذا الشهر" value={String(ops.completedProjectsThisMonth ?? 0)} color="#22C55E" icon="checkmark-circle-outline" c={c} />
                <KPICard label="تذاكر مفتوحة" value={String(ops.openTickets ?? 0)} color="#F59E0B" icon="help-buoy-outline" c={c} />
                <KPICard label="تذاكر محلولة" value={String(ops.resolvedTickets ?? 0)} color="#22C55E" icon="checkmark-done-outline" c={c} />
                <KPICard label="خرق SLA" value={String(ops.slaBreaches ?? 0)} color="#EF4444" icon="alert-circle-outline" c={c} />
                <KPICard label="مركبات نشطة" value={String(ops.activeVehicles ?? 0)} color="#3B82F6" icon="car-outline" c={c} />
                <KPICard label="صيانة معلقة" value={String(ops.pendingMaintenances ?? 0)} color="#F59E0B" icon="build-outline" c={c} />
                <KPICard label="تنبيهات مخزن" value={String(ops.warehouseAlerts ?? 0)} color="#EF4444" icon="warning-outline" c={c} />
              </View>
            </>
          )}

          {!isLoading && section === 'overview' && !kpis && (
            <GEmptyState icon="stats-chart-outline" title="لا بيانات" description="تعذّر تحميل مؤشرات الأعمال" />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function KPICard({ label, value, color, icon, c }: {
  label: string; value: string; color: string; icon: IoniconName;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <GCard style={{ flex: 1, minWidth: '45%', alignItems: 'center', paddingVertical: 14, gap: 6 }}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: 16, fontWeight: '800', color, textAlign: 'center' }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{label}</Text>
    </GCard>
  );
}

const styles = StyleSheet.create({
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
