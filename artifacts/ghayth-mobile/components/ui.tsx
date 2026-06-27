/**
 * إعادة تصدير مكتبة @workspace/ui-native + مكونات خاصة بالجوال
 *
 * الكود الحالي يستخدم بعض الأسماء القديمة (Card, Badge, ListRow, إلخ).
 * يوفر هذا الملف تسمية بديلة للتوافق مع الاستدعاءات الموجودة بدون كسر imports.
 */

// ── التصدير الكامل من المكتبة ──────────────────────────────────────────────
export {
  useTheme,
  GText,
  GButton,
  GCard,
  GBadge,
  GInput,
  GSelect,
  GListItem,
  GScreen,
  GHeader,
  GEmptyState,
  GLoadingState,
  GForm,
  GAvatar,
  GStatusBadge,
} from '@workspace/ui-native';
export type { GSelectOption } from '@workspace/ui-native';

// ── أسماء بديلة للتوافق مع الكود القديم ────────────────────────────────────
export { GCard as Card } from '@workspace/ui-native';
export { GBadge as Badge } from '@workspace/ui-native';
export { GListItem as ListRow } from '@workspace/ui-native';
export { GButton as AppButton } from '@workspace/ui-native';
export { GLoadingState as LoadingState } from '@workspace/ui-native';
export { GEmptyState as EmptyState } from '@workspace/ui-native';
export { GInput as FormField } from '@workspace/ui-native';

// ── مكونات خاصة بتطبيق غيث الجوال ─────────────────────────────────────────
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GCard, GText, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** بطاقة الحضور */
export function AttendanceCard({
  status,
  checkIn,
  checkOut,
}: {
  status: string;
  checkIn?: string;
  checkOut?: string;
}) {
  const c = useColors();
  return (
    <GCard style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={styles.attRow}>
        <GStatusBadge status={status} />
        <GText variant="subheading">حضور اليوم</GText>
      </View>
      <View style={styles.attTimes}>
        {checkIn ? (
          <View style={styles.timeBlock}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>دخول</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{checkIn}</Text>
          </View>
        ) : null}
        {checkOut ? (
          <View style={styles.timeBlock}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>خروج</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{checkOut}</Text>
          </View>
        ) : null}
      </View>
    </GCard>
  );
}

/** بطاقة الراتب */
export function SalaryCard({
  amount,
  month,
  currency = 'ر.س',
}: {
  amount: number;
  month: string;
  currency?: string;
}) {
  const c = useColors();
  return (
    <GCard style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <GText variant="subheading">آخر راتب</GText>
      <Text style={{ fontSize: 28, fontWeight: '800', color: c.brand, textAlign: 'right', marginTop: 8 }}>
        {amount.toLocaleString('ar-SA')} {currency}
      </Text>
      <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{month}</Text>
    </GCard>
  );
}

/** زر اختصار سريع */
export function QuickAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IoniconName;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border },
      ]}
    >
      <View style={[styles.qaIcon, { backgroundColor: c.brand + '1A' }]}>
        <Ionicons name={icon} size={22} color={c.brand} />
      </View>
      <Text style={{ fontSize: 12, color: c.text, textAlign: 'center', marginTop: 8, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

// مكون مُصدَّر للتوافق مع الكود القديم الذي يستخدم DetailRow
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.detailRow, { borderBottomColor: c.border }]}>
      <View style={{ flex: 1, alignItems: 'flex-start', paddingRight: 12 }}>
        {typeof value === 'string' || typeof value === 'number'
          ? <Text style={{ fontSize: 14, color: c.text, textAlign: 'right' }}>{value}</Text>
          : value}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '500', color: c.textMuted, textAlign: 'right', minWidth: 100 }}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <Ionicons name="alert-circle-outline" size={48} color={c.danger} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: c.text, textAlign: 'center', marginTop: 12 }}>
        حدث خطأ
      </Text>
      {message ? <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 4 }}>{message}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.retryBtn, { borderColor: c.brand }]}>
          <Text style={{ color: c.brand, fontWeight: '600' }}>إعادة المحاولة</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ fontSize: 22, fontWeight: '800', color: c.text, textAlign: 'right', padding: 16 }}>{children}</Text>;
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, textAlign: 'right' }}>{title}</Text>
      {action}
    </View>
  );
}

export function StatCard({ label, value, icon, tone = 'default' }: {
  label: string; value: string; icon: IoniconName;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const c = useColors();
  const toneColor = { success: '#22C55E', warning: '#F59E0B', info: '#3B82F6', danger: '#EF4444', default: c.textMuted }[tone];
  const toneBg = { success: '#F0FDF4', warning: '#FFFBEB', info: '#EFF6FF', danger: '#FEF2F2', default: c.surfaceAlt }[tone];
  return (
    <GCard style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={toneColor} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </GCard>
  );
}

const styles = StyleSheet.create({
  attRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  attTimes: { flexDirection: 'row', gap: 24 },
  timeBlock: { alignItems: 'flex-end' },
  quickAction: { width: '22%', borderRadius: 10, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  qaIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
});
