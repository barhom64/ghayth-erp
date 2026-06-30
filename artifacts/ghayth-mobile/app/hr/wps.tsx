/**
 * نظام حماية الأجور (WPS)
 * GET /api/hr/wps/reports
 * GET /api/hr/wps/status
 */
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface WpsReport {
  id: number;
  period?: string;
  month?: string;
  year?: number;
  employeeCount?: number;
  totalAmount?: number;
  status?: string;
  submittedAt?: string;
  mollRefNo?: string;
}

interface WpsResp { data?: WpsReport[] }

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

export default function WpsScreen() {
  const c = useColors();
  const { data: resp, isLoading, refetch } = useList<WpsResp>('/api/hr/wps/reports');
  const [submitting, setSubmitting] = useState<number | null>(null);

  const reports = resp?.data ?? (Array.isArray(resp) ? resp as WpsReport[] : []);

  const handleSubmit = async (reportId: number) => {
    setSubmitting(reportId);
    try {
      await apiFetch(`/api/hr/wps/reports/${reportId}/submit`, { method: 'POST' });
      refetch();
    } catch {
      // ignore
    } finally {
      setSubmitting(null);
    }
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقارير WPS…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'نظام حماية الأجور (WPS)' }} />

      {reports.length === 0 ? (
        <GEmptyState icon="document-text-outline" title="لا توجد تقارير" description="لم يتم إنشاء تقارير WPS بعد" />
      ) : reports.map(report => {
        const st = statusBadge(report.status ?? '');
        const isPending = report.status === 'pending' || report.status === 'draft';
        return (
          <GCard key={report.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{report.period ?? `${report.month ?? ''} ${report.year ?? ''}`}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{fmtMoney(report.totalAmount)}</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{report.employeeCount ?? 0} موظف</Text>
            </View>
            {report.submittedAt ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>تاريخ الرفع: {fmtDate(report.submittedAt)}</Text>
            ) : null}
            {report.mollRefNo ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>رقم المرجع: {report.mollRefNo}</Text>
            ) : null}
            {isPending ? (
              <GButton
                title="رفع تقرير WPS"
                icon="cloud-upload-outline"
                loading={submitting === report.id}
                onPress={() => handleSubmit(report.id)}
                style={{ marginTop: 4 }}
              />
            ) : null}
          </GCard>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({});
