/**
 * ملف الموظف 360 — بطاقة شاملة مع تبويبات
 * يُفتح من: قائمة الموظفين (moduleSections hr→employees) عبر زر "ملف الموظف"
 * أو مباشرة: router.push({ pathname: '/hr/employee-detail', params: { id } })
 * GET /api/employees/:id
 * GET /api/hr/attendance?employeeId=:id&pageSize=5
 * GET /api/hr/leave-requests?employeeId=:id&pageSize=5
 * GET /api/hr/payroll/slips?employeeId=:id&pageSize=3
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GText, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'attendance' | 'leaves' | 'payroll';

interface Employee {
  id: number;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  empNumber?: string;
  departmentName?: string;
  branchName?: string;
  companyName?: string;
  nationalId?: string;
  passportNumber?: string;
  iqamaNumber?: string;
  nationality?: string;
  gender?: string;
  birthDate?: string;
  hireDate?: string;
  status?: string;
  salary?: number;
  profileImage?: string;
}

interface AttendanceRecord {
  id: number;
  date: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  hoursWorked?: number;
}

interface LeaveRequest {
  id: number;
  leaveType?: string;
  startDate: string;
  endDate?: string;
  days?: number;
  status: string;
  reason?: string;
}

interface PaySlip {
  id: number;
  period?: string;
  month?: string;
  netSalary?: number;
  grossSalary?: number;
  status?: string;
}

function fmt(val: unknown): string {
  if (!val) return '—';
  return String(val);
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function EmployeeDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: emp, isLoading: empLoading } = useList<Employee>(`/api/employees/${id}`);
  const { data: attResp, isLoading: attLoading } = useList<{ data?: AttendanceRecord[] }>(
    '/api/hr/attendance', { employeeId: id, pageSize: 10 }, { enabled: tab === 'attendance' }
  );
  const { data: leaveResp, isLoading: leaveLoading } = useList<{ data?: LeaveRequest[] }>(
    '/api/hr/leave-requests', { employeeId: id, pageSize: 10 }, { enabled: tab === 'leaves' }
  );
  const { data: payResp, isLoading: payLoading } = useList<{ data?: PaySlip[] }>(
    '/api/hr/payroll/slips', { employeeId: id, pageSize: 6 }, { enabled: tab === 'payroll' }
  );

  if (empLoading) return <GLoadingState text="جارٍ تحميل ملف الموظف…" />;
  if (!emp) return <GEmptyState icon="person-outline" title="موظف غير موجود" description="تعذّر العثور على بيانات الموظف" />;

  const name = emp.name ?? emp.fullName ?? '—';
  const st = statusBadge(emp.status ?? '');

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'المعلومات', icon: 'person-outline' },
    { key: 'attendance', label: 'الحضور', icon: 'time-outline' },
    { key: 'leaves', label: 'الإجازات', icon: 'calendar-outline' },
    { key: 'payroll', label: 'الرواتب', icon: 'cash-outline' },
  ];

  const attData = attResp?.data ?? [];
  const leaveData = leaveResp?.data ?? [];
  const payData = payResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس البطاقة */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <GAvatar name={name} size="lg" />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {emp.jobTitle ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{emp.jobTitle}</Text> : null}
          {emp.companyName ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{emp.companyName}{emp.branchName ? ` · ${emp.branchName}` : ''}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 40 }}>
        {/* ─── تبويب المعلومات ─── */}
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'الرقم الوظيفي', value: emp.empNumber },
              { label: 'الإيميل', value: emp.email },
              { label: 'الجوال', value: emp.phone },
              { label: 'القسم', value: emp.departmentName },
              { label: 'الجنسية', value: emp.nationality },
              { label: 'الجنس', value: emp.gender },
              { label: 'تاريخ الميلاد', value: fmtDate(emp.birthDate) },
              { label: 'تاريخ التعيين', value: fmtDate(emp.hireDate) },
              { label: 'رقم الهوية', value: emp.nationalId },
              { label: 'رقم الإقامة', value: emp.iqamaNumber },
              { label: 'رقم الجواز', value: emp.passportNumber },
              { label: 'الراتب الأساسي', value: emp.salary ? `${Number(emp.salary).toLocaleString('ar-SA')} ر.س` : undefined },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{fmt(row.value)}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 100, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'info' && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <GButton title="إجراء تأديبي" icon="warning-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/discipline-new' as never, params: { employeeId: id } })} />
            <GButton title="تقييم الأداء" icon="star-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/evaluation-new' as never, params: { employeeId: id } })} />
          </View>
        )}

        {/* ─── تبويب الحضور ─── */}
        {tab === 'attendance' && (
          attLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          attData.length === 0 ? <GEmptyState icon="time-outline" title="لا سجلات حضور" description="لم يُعثر على سجلات حضور لهذا الموظف" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {attData.map((a, i) => {
              const st = statusBadge(a.status);
              return (
                <View key={a.id} style={[styles.listRow, { borderBottomColor: c.border }, i === attData.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{fmtDate(a.date)}</Text>
                    {(a.checkIn || a.checkOut) && (
                      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                        {a.checkIn ? `دخول: ${a.checkIn}` : ''}{a.checkIn && a.checkOut ? ' · ' : ''}{a.checkOut ? `خروج: ${a.checkOut}` : ''}
                      </Text>
                    )}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}

        {/* ─── تبويب الإجازات ─── */}
        {tab === 'leaves' && (
          <>
          <GButton
            title="طلب إجازة جديد"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push('/hr/leave-request-new' as never)}
            style={{ marginBottom: 8 }}
          />
          {leaveLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          leaveData.length === 0 ? <GEmptyState icon="calendar-outline" title="لا طلبات إجازة" description="لم يُعثر على طلبات إجازة لهذا الموظف" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {leaveData.map((l, i) => {
              const st = statusBadge(l.status);
              return (
                <View key={l.id} style={[styles.listRow, { borderBottomColor: c.border }, i === leaveData.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{l.leaveType ?? '—'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(l.startDate)}{l.days ? ` · ${l.days} أيام` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {/* ─── تبويب الرواتب ─── */}
        {tab === 'payroll' && (
          payLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          payData.length === 0 ? <GEmptyState icon="barcode-outline" title="لا كشوف رواتب" description="لم يُعثر على كشوف رواتب لهذا الموظف" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {payData.map((p, i) => {
              const st = statusBadge(p.status ?? '');
              return (
                <View key={p.id} style={[styles.listRow, { borderBottomColor: c.border }, i === payData.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{p.period ?? p.month ?? '—'}</Text>
                    {p.netSalary !== undefined && (
                      <Text style={{ fontSize: 13, color: '#22C55E', fontWeight: '700', textAlign: 'right' }}>
                        {Number(p.netSalary).toLocaleString('ar-SA')} ر.س
                      </Text>
                    )}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
