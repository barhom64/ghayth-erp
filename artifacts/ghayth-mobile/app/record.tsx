/**
 * تفاصيل السجل — عرض key-value مع إجراءات القسم
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GCard, GEmptyState, GStatusBadge, GButton, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { getSection, statusBadge, type SectionAction } from '@/lib/moduleSections';
import { getRecord } from '@/lib/recordStore';
import { apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { allowedModuleSet, canApprove } from '@/lib/modules';

const LABELS: Record<string, string> = {
  id: 'المعرّف', ref: 'المرجع', status: 'الحالة', name: 'الاسم', title: 'العنوان',
  description: 'الوصف', total: 'الإجمالي', totalAmount: 'الإجمالي', amount: 'المبلغ',
  paidAmount: 'المبلغ المدفوع', balance: 'الرصيد', cost: 'التكلفة', budget: 'الميزانية',
  salary: 'الراتب', estimatedValue: 'القيمة المتوقعة', value: 'القيمة', probability: 'الاحتمالية',
  date: 'التاريخ', createdAt: 'تاريخ الإنشاء', updatedAt: 'آخر تحديث', dueDate: 'تاريخ الاستحقاق',
  startDate: 'تاريخ البداية', endDate: 'تاريخ النهاية', issueDate: 'تاريخ الإصدار',
  closingDate: 'تاريخ الإغلاق', filingDate: 'تاريخ القيد', effectiveDate: 'تاريخ السريان',
  expiryDate: 'تاريخ الانتهاء', arrivalDate: 'تاريخ الوصول', departureDate: 'تاريخ المغادرة',
  lastRun: 'آخر تشغيل', clientName: 'العميل', customerName: 'العميل', tenantName: 'المستأجر',
  supplierName: 'المورد', vendorName: 'المورد', agentName: 'الوكيل', driverName: 'السائق',
  assigneeName: 'المسؤول', requesterName: 'مقدّم الطلب', email: 'البريد الإلكتروني',
  phone: 'الهاتف', code: 'الرمز', type: 'النوع', category: 'التصنيف', priority: 'الأولوية',
  plateNumber: 'رقم اللوحة', vehiclePlate: 'رقم اللوحة', make: 'الصنع', model: 'الطراز',
  sku: 'رمز المنتج', quantityOnHand: 'الكمية المتاحة', passportNumber: 'رقم الجواز',
  visaNumber: 'رقم التأشيرة', groupName: 'المجموعة', groupNumber: 'رقم المجموعة',
  pilgrimCount: 'عدد المعتمرين', court: 'المحكمة', version: 'الإصدار', role: 'الدور',
  branchName: 'الفرع', companyName: 'الشركة', jobTitle: 'المسمى الوظيفي',
  empNumber: 'الرقم الوظيفي', taxNumber: 'الرقم الضريبي', contractNumber: 'رقم العقد',
  ticketNumber: 'رقم التذكرة', subject: 'الموضوع', unitNumber: 'رقم الوحدة',
  buildingName: 'المبنى', caseNumber: 'رقم القضية', invoiceNumber: 'رقم الفاتورة',
  orderNumber: 'رقم الأمر', stationName: 'المحطة',
};

const HIDDEN = new Set(['deletedAt', 'password', 'passwordHash', 'companyId', 'branchId', 'tenantId']);
const DATE_KEYS = /(date|createdat|updatedat|lastrun)/i;
const MONEY_KEYS = /(total|amount|balance|cost|budget|salary|value|price|paid)/i;

function formatDate(val: unknown): string {
  if (!val) return '—';
  try { return new Date(String(val)).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return String(val); }
}

function formatCurrency(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return String(val ?? '');
  return n.toLocaleString('ar-SA') + ' ر.س';
}

function isActionVisible(action: SectionAction, row: Record<string, unknown>): boolean {
  if (!action.showWhenStatus) return true;
  const statusField = action.statusField ?? 'status';
  const val = String(row[statusField] ?? '');
  return action.showWhenStatus.includes(val);
}

const MANAGER_ACTION_KEYS = new Set(['approve', 'reject', 'post', 'reverse']);

export default function RecordScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const stored = getRecord();
  const title = stored?.title ?? 'تفاصيل';
  const initialRow: Record<string, unknown> = stored?.row ?? {};
  const [row, setRow] = useState<Record<string, unknown>>(initialRow);
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const def = stored?.module && stored?.section
    ? getSection(stored.module, stored.section)
    : null;

  const recordId = initialRow[(def?.write?.idField ?? 'id')] ?? initialRow.id;

  // إذا كانت البيانات منقوصة (من إشعار مثلًا) نجلب التفاصيل من الخادم
  useEffect(() => {
    if (!recordId || !def?.write?.detailPath) return;
    const keys = Object.keys(initialRow).filter(k => k !== 'id');
    if (keys.length > 0) return; // البيانات كافية
    setDetailLoading(true);
    apiFetch<Record<string, unknown>>(def.write.detailPath(recordId as string | number))
      .then(data => {
        const record = (data && typeof data === 'object' && 'data' in data && data.data)
          ? data.data as Record<string, unknown>
          : data;
        setRow(record);
      })
      .catch(() => {/* استمر بالبيانات المتاحة */})
      .finally(() => setDetailLoading(false));
  }, []);
  const allowed = allowedModuleSet(user?.userRoles);
  const isManager = canApprove(user?.userRoles);
  const hasModuleAccess = def?.write?.moduleKey ? allowed.has(def.write.moduleKey) : false;

  const canEdit = hasModuleAccess && !!def?.write?.editFields?.length && recordId !== undefined;
  const canDelete = hasModuleAccess && !!def?.write?.canDelete && recordId !== undefined;
  const actions = (def?.write?.actions ?? [])
    .filter(a => isActionVisible(a, row))
    .filter(a => MANAGER_ACTION_KEYS.has(a.key) ? isManager : true);

  const entries = Object.entries(row).filter(
    ([k, v]) => !HIDDEN.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'object',
  );

  const handleAction = async (action: SectionAction) => {
    const id = recordId as string | number;
    const doCall = async () => {
      setInFlight(action.key);
      try {
        await apiFetch(action.path(id), {
          method: action.method ?? 'POST',
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
        await qc.invalidateQueries({ queryKey: ['section', stored?.module, stored?.section] });
        Alert.alert('تم', action.successText ?? `تم تنفيذ "${action.label}" بنجاح`);
        router.back();
      } catch (e: unknown) {
        Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تنفيذ الإجراء');
      } finally {
        setInFlight(null);
      }
    };

    if (action.confirm) {
      Alert.alert('تأكيد', action.confirm, [
        { text: 'إلغاء', style: 'cancel' },
        { text: action.label, style: action.tone === 'danger' ? 'destructive' : 'default', onPress: doCall },
      ]);
    } else {
      await doCall();
    }
  };

  const handleDelete = () => {
    Alert.alert('تأكيد الحذف', 'هل أنت متأكد من حذف هذا السجل؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive', onPress: async () => {
          setInFlight('delete');
          try {
            const id = recordId as string | number;
            const path = def!.write!.deletePath ? def!.write!.deletePath(id) : `${def!.endpoint}/${id}`;
            await apiFetch(path, { method: 'DELETE' });
            await qc.invalidateQueries({ queryKey: ['section', stored?.module, stored?.section] });
            router.back();
          } catch (e: unknown) {
            Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحذف');
          } finally {
            setInFlight(null);
          }
        },
      },
    ]);
  };

  if (detailLoading) return <GLoadingState text="جارٍ تحميل التفاصيل…" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen
        options={{
          title: title || 'تفاصيل',
          headerRight: canEdit ? () => (
            <Pressable
              onPress={() => router.push({
                pathname: '/m/[module]/[section]/form',
                params: { module: stored!.module!, section: stored!.section!, id: String(recordId) },
              })}
              style={{ marginLeft: 12 }}
            >
              <Ionicons name="create-outline" size={22} color={c.brand} />
            </Pressable>
          ) : undefined,
        }}
      />

      {entries.length === 0 ? (
        <GEmptyState icon="document-outline" title="لا تفاصيل" description="لا توجد بيانات لعرضها لهذا السجل." />
      ) : (
        <GCard>
          {entries.map(([k, v], i) => {
            const label = LABELS[k] ?? k;
            let displayValue: React.ReactNode;

            if (typeof v === 'boolean') {
              displayValue = v ? 'نعم' : 'لا';
            } else if (k === 'status' && typeof v === 'string') {
              const st = statusBadge(v);
              displayValue = st ? <GStatusBadge status={st.label} size="sm" /> : String(v);
            } else if (DATE_KEYS.test(k)) {
              displayValue = formatDate(v);
            } else if (MONEY_KEYS.test(k) && !Number.isNaN(Number(v))) {
              displayValue = formatCurrency(v);
            } else {
              displayValue = String(v);
            }

            return (
              <View
                key={k}
                style={[
                  styles.row,
                  { borderBottomColor: c.border },
                  i < entries.length - 1 && { borderBottomWidth: 1 },
                ]}
              >
                <View style={styles.valueCell}>
                  {typeof displayValue === 'string' ? (
                    <Text style={{ fontSize: 14, color: c.text, textAlign: 'right' }}>{displayValue}</Text>
                  ) : displayValue}
                </View>
                <Text style={[styles.labelText, { color: c.textMuted }]}>{label}</Text>
              </View>
            );
          })}
        </GCard>
      )}

      {/* إجراءات القسم */}
      {actions.length > 0 && (
        <View style={styles.actionsSection}>
          {actions.map(action => (
            <GButton
              key={action.key}
              title={action.label}
              icon={action.icon}
              variant={action.tone === 'danger' ? 'danger' : action.tone === 'secondary' ? 'secondary' : 'primary'}
              loading={inFlight === action.key}
              onPress={() => handleAction(action)}
              style={{ marginBottom: 10 }}
            />
          ))}
        </View>
      )}

      {/* حذف */}
      {canDelete && (
        <View style={{ marginTop: 8 }}>
          <GButton
            title="حذف السجل"
            icon="trash-outline"
            variant="danger"
            loading={inFlight === 'delete'}
            onPress={handleDelete}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  labelText: { fontSize: 13, fontWeight: '500', textAlign: 'right', minWidth: 100 },
  valueCell: { flex: 1, alignItems: 'flex-start', paddingRight: 12 },
  actionsSection: { marginTop: 16 },
});
