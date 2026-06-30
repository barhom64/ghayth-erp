/**
 * مساحتي — بطاقة الموظف والاختصارات الشخصية
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GScreen, GCard, GAvatar, GText, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useAuth, type Assignment } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';
import { canApprove } from '@/lib/modules';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface LeaveBalance { name: string; entitled: number; used: number; remaining: number }
interface MySpaceData {
  attendance?: { status: string; checkIn?: string; checkOut?: string } | null;
  leaveBalances?: LeaveBalance[];
  lastPayslip?: { netSalary?: number; period?: string; currency?: string } | null;
}

interface QuickAction { label: string; icon: IoniconName; route: string; managerOnly?: boolean }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'تسجيل الحضور', icon: 'finger-print-outline',      route: '/hr/attendance' },
  { label: 'طلب إجازة',     icon: 'calendar-outline',          route: '/hr/leave-new' },
  { label: 'أرصدة الإجازة', icon: 'pie-chart-outline',         route: '/hr/leave-balances' },
  { label: 'وقت إضافي',     icon: 'alarm-outline',             route: '/hr/overtime-new' },
  { label: 'طلب سلفة',      icon: 'card-outline',              route: '/hr/loan-new' },
  { label: 'طلب استئذان',   icon: 'hand-left-outline',         route: '/hr/excuse-new' },
  { label: 'كشف الراتب',    icon: 'document-text-outline',     route: '/hr/payslip' },
  { label: 'طلباتي',         icon: 'list-outline',              route: '/hr/my-requests' },
];

function AssignmentSwitcherModal({ assignments, currentCompanyId, onSwitch, onClose }: {
  assignments: Assignment[];
  currentCompanyId?: number;
  onSwitch: (id: number) => void;
  onClose: () => void;
}) {
  const c = useColors();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
        <View style={[styles.modalHandle, { backgroundColor: c.border }]} />
        <GText variant="subheading" style={{ padding: 16, paddingBottom: 8, textAlign: 'right' }}>تبديل الشركة</GText>
        <ScrollView>
          {assignments.map(a => {
            const isActive = a.companyId === currentCompanyId;
            return (
              <Pressable
                key={a.id}
                onPress={() => { if (!isActive) onSwitch(a.id); onClose(); }}
                style={[styles.assignmentRow, { borderBottomColor: c.border, backgroundColor: isActive ? c.primary + '10' : 'transparent' }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'right' }}>{a.companyName ?? 'شركة غير معروفة'}</Text>
                  {a.branchName ? <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{a.branchName}</Text> : null}
                  {a.jobTitle ? <Text style={{ fontSize: 12, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{a.jobTitle}</Text> : null}
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={20} color={c.brand} style={{ marginRight: 8 }} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function MeScreen() {
  const c = useColors();
  const { user, assignments, logout, switchAssignment, refreshUser } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useList<MySpaceData>('/api/my-space');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const isManager = canApprove(user?.userRoles);

  const att = data?.attendance;
  const annualLeave = data?.leaveBalances?.find(b =>
    b.name?.includes('سنو') || b.name?.includes('سنوي') || b.name?.toLowerCase().includes('annual')
  ) ?? data?.leaveBalances?.find(b => b.entitled >= 15) ?? data?.leaveBalances?.[0];
  const salary = data?.lastPayslip;

  const handleSwitch = async (assignmentId: number) => {
    setSwitching(true);
    try {
      await switchAssignment(assignmentId);
      // مسح كامل لكاش البيانات بعد تبديل الشركة لضمان تحميل بيانات الشركة الجديدة
      qc.clear();
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تبديل الشركة');
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout },
    ]);
  };

  const handleCalendarToggle = async () => {
    const next = user?.preferredCalendar === 'hijri' ? 'gregorian' : 'hijri';
    setSavingPref(true);
    try {
      await apiFetch('/api/auth/preferences', { method: 'PATCH', body: JSON.stringify({ preferredCalendar: next }) });
      await refreshUser();
    } catch { /* silent — server may not have this endpoint yet */ }
    finally { setSavingPref(false); }
  };

  return (
    <GScreen scrollable>
      {/* بطاقة الموظف */}
      <GCard style={[styles.empCard, { backgroundColor: c.primary }]}>
        <View style={styles.empRow}>
          <GAvatar name={user?.name} size="lg" />
          <View style={styles.empInfo}>
            <GText variant="heading" color={c.onPrimary}>{user?.name ?? '—'}</GText>
            {user?.jobTitle ? <GText variant="label" color={c.onPrimary + 'CC'}>{user.jobTitle}</GText> : null}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 4, gap: 6, flexWrap: 'wrap' }}>
              {user?.companyName ? (
                <View style={styles.companyTag}>
                  <Ionicons name="business-outline" size={11} color={c.onPrimary + 'BB'} />
                  <Text style={{ fontSize: 11, color: c.onPrimary + 'BB', marginRight: 3 }}>{user.companyName}</Text>
                </View>
              ) : null}
              {user?.branchName ? (
                <View style={styles.companyTag}>
                  <Ionicons name="git-branch-outline" size={11} color={c.onPrimary + 'BB'} />
                  <Text style={{ fontSize: 11, color: c.onPrimary + 'BB', marginRight: 3 }}>{user.branchName}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {assignments.length > 1 && (
          <Pressable
            onPress={() => setSwitcherOpen(true)}
            disabled={switching}
            style={[styles.switchBtn, { borderColor: c.onPrimary + '40' }]}
          >
            <Ionicons name="swap-horizontal-outline" size={14} color={c.onPrimary + 'CC'} />
            <Text style={{ fontSize: 12, color: c.onPrimary + 'CC', marginRight: 4 }}>
              {switching ? 'جارٍ التبديل…' : `تبديل الشركة (${assignments.length})`}
            </Text>
          </Pressable>
        )}
      </GCard>

      {/* بطاقات سريعة */}
      <View style={styles.cardsRow}>
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>حضور اليوم</GText>
          {isLoading ? <ActivityIndicator size="small" color={c.brand} style={{ marginTop: 4 }} /> :
            att ? <GStatusBadge status={statusBadge(att.status)?.label ?? att.status} size="sm" /> : <GText variant="caption" color={c.textFaint}>—</GText>}
          {att?.checkIn ? <GText variant="caption" color={c.textMuted} style={{ marginTop: 4 }}>دخول: {att.checkIn}</GText> : null}
        </GCard>
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>رصيد الإجازة</GText>
          {isLoading ? <ActivityIndicator size="small" color={c.brand} style={{ marginTop: 4 }} /> :
            <GText variant="subheading" style={{ marginTop: 4 }}>{annualLeave?.remaining ?? '—'}</GText>}
          <GText variant="caption" color={c.textFaint}>يوم متبقٍ</GText>
        </GCard>
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>آخر راتب</GText>
          {isLoading ? <ActivityIndicator size="small" color={c.brand} style={{ marginTop: 4 }} /> :
            salary ? (
              <>
                <GText variant="subheading" style={{ marginTop: 4 }}>{Number(salary.netSalary ?? 0).toLocaleString('ar-SA')}</GText>
                <GText variant="caption" color={c.textFaint}>{salary.currency ?? 'ر.س'} — {salary.period ?? '—'}</GText>
              </>
            ) : <GText variant="caption" color={c.textFaint}>—</GText>}
        </GCard>
      </View>

      {/* الاختصارات */}
      <GText variant="subheading" style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>اختصارات</GText>
      <GCard style={{ marginHorizontal: 16 }}>
        {QUICK_ACTIONS.filter(qa => !qa.managerOnly || isManager).map((qa, i, arr) => (
          <Pressable
            key={qa.label}
            onPress={() => router.push(qa.route as never)}
            style={({ pressed }) => [
              styles.actionRow,
              { backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
              i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
            ]}
          >
            <Ionicons name="chevron-back" size={16} color={c.textFaint} />
            <Text style={{ flex: 1, fontSize: 15, color: c.text, textAlign: 'right', marginRight: 12 }}>{qa.label}</Text>
            <View style={[styles.actionIcon, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name={qa.icon} size={18} color={c.brand} />
            </View>
          </Pressable>
        ))}
      </GCard>

      {/* معلومات الحساب */}
      <GCard style={{ marginHorizontal: 16, marginTop: 12 }}>
        <GText variant="label" color={c.textMuted} style={{ textAlign: 'right', marginBottom: 8 }}>معلومات الحساب</GText>
        {user?.email ? (
          <View style={styles.infoRow}>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{user.email}</Text>
            <Ionicons name="mail-outline" size={15} color={c.textFaint} />
          </View>
        ) : null}
        {user?.empNumber ? (
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>#{user.empNumber}</Text>
            <Ionicons name="id-card-outline" size={15} color={c.textFaint} />
          </View>
        ) : null}
        {(user?.userRoles?.length ?? 0) > 0 ? (
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', flex: 1 }} numberOfLines={2}>
              {user!.userRoles!.map(r => r.label ?? r.roleKey).join(' · ')}
            </Text>
            <Ionicons name="shield-checkmark-outline" size={15} color={c.textFaint} />
          </View>
        ) : user?.role ? (
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{user.role}</Text>
            <Ionicons name="shield-checkmark-outline" size={15} color={c.textFaint} />
          </View>
        ) : null}
      </GCard>

      {/* التفضيلات */}
      <GCard style={{ marginHorizontal: 16, marginTop: 12 }}>
        <GText variant="label" color={c.textMuted} style={{ textAlign: 'right', marginBottom: 8 }}>التفضيلات</GText>
        <Pressable
          onPress={handleCalendarToggle}
          disabled={savingPref}
          style={[styles.infoRow, { opacity: savingPref ? 0.6 : 1 }]}
        >
          {savingPref
            ? <ActivityIndicator size="small" color={c.brand} />
            : <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                {user?.preferredCalendar === 'hijri' ? 'هجري' : 'ميلادي'}
              </Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, color: c.text }}>التقويم</Text>
            <Ionicons name="calendar-outline" size={15} color={c.textFaint} />
          </View>
        </Pressable>
      </GCard>

      {/* تغيير كلمة المرور */}
      <Pressable
        onPress={() => router.push('/hr/change-password' as never)}
        style={[styles.logoutBtn, { borderColor: c.border, marginBottom: 0 }]}
      >
        <Ionicons name="lock-closed-outline" size={18} color={c.text} />
        <Text style={{ fontSize: 15, color: c.text, fontWeight: '500', marginRight: 8 }}>تغيير كلمة المرور</Text>
      </Pressable>

      {/* تسجيل الخروج */}
      <Pressable onPress={handleLogout} style={[styles.logoutBtn, { borderColor: c.danger }]}>
        <Ionicons name="log-out-outline" size={18} color={c.danger} />
        <Text style={{ fontSize: 15, color: c.danger, fontWeight: '600', marginRight: 8 }}>تسجيل الخروج</Text>
      </Pressable>

      {switcherOpen && (
        <AssignmentSwitcherModal
          assignments={assignments}
          currentCompanyId={user?.companyId}
          onSwitch={handleSwitch}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </GScreen>
  );
}

const styles = StyleSheet.create({
  empCard: { margin: 16, padding: 20 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  empInfo: { flex: 1 },
  companyTag: { flexDirection: 'row-reverse', alignItems: 'center' },
  switchBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 7, borderWidth: 1, borderRadius: 8 },
  cardsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 24, marginBottom: 16, paddingVertical: 14, borderWidth: 1, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: '#00000060' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  assignmentRow: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
});
