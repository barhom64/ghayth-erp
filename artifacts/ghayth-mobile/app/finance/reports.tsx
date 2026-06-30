/**
 * التقارير المالية — قائمة الدخل، الميزانية، ميزان المراجعة
 * GET /api/finance/reports/pl  (P&L)
 * GET /api/finance/reports/balance-sheet
 * GET /api/finance/reports/trial-balance
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GScreen, GCard, GText, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type ReportTab = 'pl' | 'bs' | 'tb';

interface PLRow {
  label: string;
  amount: number;
  isSection?: boolean;
  isSub?: boolean;
}

interface PLReport {
  rows?: PLRow[];
  revenue?: number;
  expenses?: number;
  netProfit?: number;
  grossProfit?: number;
  period?: string;
}

interface BSRow {
  label: string;
  amount: number;
  isSection?: boolean;
  isSub?: boolean;
}

interface BSReport {
  assets?: BSRow[];
  liabilities?: BSRow[];
  equity?: BSRow[];
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  period?: string;
}

interface TBRow {
  accountCode?: string;
  accountName: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

interface TBReport {
  rows?: TBRow[];
  data?: TBRow[];
  totalDebit?: number;
  totalCredit?: number;
  period?: string;
}

function fmtNum(n?: number): string {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(n);
  const formatted = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)} م`
    : abs >= 1_000
    ? `${(abs / 1_000).toFixed(1)} ك`
    : abs.toLocaleString('ar-SA');
  return (n < 0 ? '(' : '') + formatted + (n < 0 ? ')' : '') + ' ر.س';
}

function amountColor(n?: number, c?: ReturnType<typeof useColors>): string {
  if (!c || n === undefined || n === null) return c?.text ?? '#000';
  return n < 0 ? '#EF4444' : n > 0 ? '#22C55E' : c.textMuted;
}

export default function FinanceReportsScreen() {
  const c = useColors();
  const [tab, setTab] = useState<ReportTab>('pl');

  const { data: plData, isLoading: plLoading } = useList<PLReport>('/api/finance/reports/pl', undefined, { enabled: tab === 'pl' });
  const { data: bsData, isLoading: bsLoading } = useList<BSReport>('/api/finance/reports/balance-sheet', undefined, { enabled: tab === 'bs' });
  const { data: tbData, isLoading: tbLoading } = useList<TBReport>('/api/finance/reports/trial-balance', undefined, { enabled: tab === 'tb' });

  const isLoading = tab === 'pl' ? plLoading : tab === 'bs' ? bsLoading : tbLoading;

  const TABS: Array<{ key: ReportTab; label: string }> = [
    { key: 'pl', label: 'الدخل' },
    { key: 'bs', label: 'الميزانية' },
    { key: 'tb', label: 'المراجعة' },
  ];

  return (
    <GScreen>
      <Stack.Screen options={{ title: 'التقارير المالية' }} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading && <GLoadingState text="جارٍ تحميل التقرير…" />}

      {!isLoading && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* ─── P&L ─── */}
          {tab === 'pl' && plData && (
            <>
              {plData.period && (
                <GText variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: 12 }}>
                  الفترة: {plData.period}
                </GText>
              )}
              {/* Summary cards */}
              <View style={styles.summaryRow}>
                <SummaryCard label="الإيرادات" value={fmtNum(plData.revenue)} color="#22C55E" c={c} />
                <SummaryCard label="المصروفات" value={fmtNum(plData.expenses)} color="#EF4444" c={c} />
                <SummaryCard
                  label="صافي الربح"
                  value={fmtNum(plData.netProfit)}
                  color={(plData.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444'}
                  c={c}
                />
              </View>

              {/* Rows */}
              {(plData.rows?.length ?? 0) > 0 && (
                <GCard style={{ gap: 0, padding: 0, marginTop: 12 }}>
                  {plData.rows!.map((row, i) => (
                    <View
                      key={i}
                      style={[
                        styles.row,
                        { borderBottomColor: c.border },
                        row.isSection && { backgroundColor: c.surfaceAlt },
                        i === plData.rows!.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={[styles.rowAmt, { color: amountColor(row.amount, c) }]}>
                        {fmtNum(row.amount)}
                      </Text>
                      <Text style={[
                        styles.rowLabel,
                        { color: row.isSection ? c.text : c.textMuted },
                        row.isSection && { fontWeight: '700' },
                        row.isSub && { paddingRight: 16 },
                      ]}>
                        {row.label}
                      </Text>
                    </View>
                  ))}
                </GCard>
              )}
            </>
          )}

          {/* ─── Balance Sheet ─── */}
          {tab === 'bs' && bsData && (
            <>
              {bsData.period && (
                <GText variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: 12 }}>
                  الفترة: {bsData.period}
                </GText>
              )}
              <View style={styles.summaryRow}>
                <SummaryCard label="الأصول" value={fmtNum(bsData.totalAssets)} color="#3B82F6" c={c} />
                <SummaryCard label="الالتزامات" value={fmtNum(bsData.totalLiabilities)} color="#F59E0B" c={c} />
                <SummaryCard label="حقوق الملكية" value={fmtNum(bsData.totalEquity)} color="#8B5CF6" c={c} />
              </View>

              {[
                { title: 'الأصول', rows: bsData.assets ?? [] },
                { title: 'الالتزامات', rows: bsData.liabilities ?? [] },
                { title: 'حقوق الملكية', rows: bsData.equity ?? [] },
              ].filter(s => s.rows.length > 0).map(section => (
                <View key={section.title} style={{ marginTop: 12 }}>
                  <GText variant="subheading" style={{ marginBottom: 6, fontWeight: '700' }}>{section.title}</GText>
                  <GCard style={{ gap: 0, padding: 0 }}>
                    {section.rows.map((row, i) => (
                      <View
                        key={i}
                        style={[
                          styles.row,
                          { borderBottomColor: c.border },
                          row.isSection && { backgroundColor: c.surfaceAlt },
                          i === section.rows.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Text style={[styles.rowAmt, { color: c.text }]}>{fmtNum(row.amount)}</Text>
                        <Text style={[styles.rowLabel, { color: row.isSection ? c.text : c.textMuted }, row.isSection && { fontWeight: '700' }]}>
                          {row.label}
                        </Text>
                      </View>
                    ))}
                  </GCard>
                </View>
              ))}
            </>
          )}

          {/* ─── Trial Balance ─── */}
          {tab === 'tb' && tbData && (
            <>
              {tbData.period && (
                <GText variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: 8 }}>
                  الفترة: {tbData.period}
                </GText>
              )}
              {/* Header */}
              <View style={[styles.tbHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.tbCell, styles.tbAmt, { color: c.textMuted }]}>الرصيد</Text>
                <Text style={[styles.tbCell, styles.tbAmt, { color: c.textMuted }]}>دائن</Text>
                <Text style={[styles.tbCell, styles.tbAmt, { color: c.textMuted }]}>مدين</Text>
                <Text style={[styles.tbCell, { flex: 1, color: c.textMuted }]}>الحساب</Text>
              </View>
              <GCard style={{ gap: 0, padding: 0 }}>
                {(tbData.rows ?? tbData.data ?? []).map((row, i, arr) => (
                  <View
                    key={i}
                    style={[styles.tbRow, { borderBottomColor: c.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <Text style={[styles.tbCell, styles.tbAmt, { color: amountColor(row.balance, c) }]}>
                      {fmtNum(row.balance)}
                    </Text>
                    <Text style={[styles.tbCell, styles.tbAmt, { color: c.textMuted }]}>
                      {row.credit ? fmtNum(row.credit) : '—'}
                    </Text>
                    <Text style={[styles.tbCell, styles.tbAmt, { color: c.textMuted }]}>
                      {row.debit ? fmtNum(row.debit) : '—'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tbLabel, { color: c.text }]} numberOfLines={1}>{row.accountName}</Text>
                      {row.accountCode ? <Text style={{ fontSize: 10, color: c.textFaint }}>{row.accountCode}</Text> : null}
                    </View>
                  </View>
                ))}
              </GCard>

              {/* Totals */}
              {(tbData.totalDebit !== undefined || tbData.totalCredit !== undefined) && (
                <GCard style={[styles.totalsRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <GText variant="caption" color="muted">إجمالي المدين</GText>
                    <GText variant="subheading" style={{ fontWeight: '700' }}>{fmtNum(tbData.totalDebit)}</GText>
                  </View>
                  <View style={[styles.divider, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <GText variant="caption" color="muted">إجمالي الدائن</GText>
                    <GText variant="subheading" style={{ fontWeight: '700' }}>{fmtNum(tbData.totalCredit)}</GText>
                  </View>
                </GCard>
              )}
            </>
          )}
        </ScrollView>
      )}
    </GScreen>
  );
}

function SummaryCard({ label, value, color, c }: { label: string; value: string; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color, textAlign: 'center', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, gap: 8 },
  rowLabel: { flex: 1, fontSize: 13, textAlign: 'right' },
  rowAmt: { fontSize: 13, fontWeight: '600', minWidth: 90, textAlign: 'left' },
  tbHeader: { flexDirection: 'row', padding: 8, borderRadius: 8, marginBottom: 4 },
  tbRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, gap: 4 },
  tbCell: { fontSize: 11 },
  tbAmt: { minWidth: 65, textAlign: 'left' },
  tbLabel: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  totalsRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 40 },
});
